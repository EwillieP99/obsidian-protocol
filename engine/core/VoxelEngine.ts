'use client';

// VoxelEngine — Phase 2: worker stand-up.
//
// The engine spawns voxel.worker on init() and seeds it with the current
// voxelStore state. The worker maintains a parallel chunk-backed copy of
// the world so future phases (RenderBridge, raycast worker) can read from
// it directly off the main thread.
//
// For Phase 2 specifically, the API surface (applyOps, undo, redo, etc.)
// continues to proxy to voxelStore — voxelStore stays canonical for the V1
// UI which has not yet been migrated. The worker is along for the ride; its
// events are bridged through the engine event surface for Phase 3 to
// consume. Phase 3's RenderBridge subscribes to engine 'patch' events and
// will be driven by worker output.
//
// Black-box rule: no React imports here, no Three.js imports. Pure TS.

import { useVoxelStore } from '@/stores/voxelStore';
import { BLOCK_INDEX_TABLE, BLOCK_TYPES, blockIdToIndex, indexToBlockId } from '@/lib/blocks';
import { ENGINE_CHRONO_LIMIT, STATS_TICK_MS, WORLD_SIZE, WORLD_Y_ROUNDED } from '@/lib/constants';
import { cellLinearIdx, unkey } from '@/lib/utils';
import type { BlockId, Contract, HistoryEntry, SerializedSave } from '@/types';
import type {
  CellDelta,
  CellOp,
  ChronoEntry,
  EngineEvent,
  EngineEventHandler,
  EngineEventType,
  EngineStats,
  IVoxelEngine,
  LayerMeta,
  RaycastResult,
} from '@/types/engine';
import type {
  BlockTableEntry,
  MainToVoxelMsg,
  VoxelToMainMsg,
  WireDelta,
  WireOp,
} from '@/engine/bridge/WorkerProtocol';

// ---------------------------------------------------------------------------
// Typed event emitter
// ---------------------------------------------------------------------------

// Stored handler shape — widened so the Map cell can hold any variant. We
// cast from EngineEventHandler<T> to this via `unknown` at registration time;
// the discriminant guarantees runtime-shape match on dispatch.
type AnyHandler = (event: EngineEvent) => void;

class TypedEmitter {
  private handlers = new Map<EngineEventType, Set<AnyHandler>>();

  on<T extends EngineEventType>(type: T, handler: EngineEventHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const stored = handler as unknown as AnyHandler;
    set.add(stored);
    return () => set!.delete(stored);
  }

  emit(event: EngineEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    // Snapshot in case a handler unsubscribes itself mid-dispatch.
    for (const h of Array.from(set)) {
      try {
        h(event);
      } catch (err) {
        // Surface handler errors without breaking other subscribers.
        // eslint-disable-next-line no-console
        console.error('[VoxelEngine] event handler threw:', err);
      }
    }
  }

  dispose(): void {
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers — translate V1 store shapes to engine deltas
// ---------------------------------------------------------------------------

function bakedOpacity(blockId: BlockId | null, layer: LayerMeta | undefined): number {
  if (blockId === null) return 0;
  const block = BLOCK_TYPES[blockId];
  const blockOpacity = block.opacity ?? 1;
  const layerOpacity = layer?.opacity ?? 1;
  return Math.max(0, Math.min(1, blockOpacity * layerOpacity));
}

function deltasFromHistoryEntry(
  entry: HistoryEntry,
  direction: 'forward' | 'inverse',
  layers: LayerMeta[],
): CellDelta[] {
  const out: CellDelta[] = [];
  for (const [k, before, after] of entry.patch) {
    const [x, y, z] = unkey(k);
    const prev = direction === 'forward' ? before : after;
    const next = direction === 'forward' ? after : before;
    if (prev === next) continue;
    const layer = layers.find((l) => l.id === y);
    out.push({
      cellIdx: cellLinearIdx(x, y, z),
      x,
      y,
      z,
      prevBlockId: prev,
      newBlockId: next,
      layer: y,
      opacity: bakedOpacity(next, layer),
    });
  }
  return out;
}

function deltasFromClearedCells(
  cleared: Iterable<[string, BlockId]>,
  layers: LayerMeta[],
): CellDelta[] {
  const out: CellDelta[] = [];
  for (const [k, prev] of cleared) {
    const [x, y, z] = unkey(k);
    out.push({
      cellIdx: cellLinearIdx(x, y, z),
      x,
      y,
      z,
      prevBlockId: prev,
      newBlockId: null,
      layer: y,
      opacity: 0,
    });
  }
  return out;
}

function deltasFromLoadedCells(
  cells: Map<string, BlockId>,
  layers: LayerMeta[],
): CellDelta[] {
  const out: CellDelta[] = [];
  for (const [k, next] of cells.entries()) {
    const [x, y, z] = unkey(k);
    const layer = layers.find((l) => l.id === y);
    out.push({
      cellIdx: cellLinearIdx(x, y, z),
      x,
      y,
      z,
      prevBlockId: null,
      newBlockId: next,
      layer: y,
      opacity: bakedOpacity(next, layer),
    });
  }
  return out;
}

function computeStats(state: ReturnType<typeof useVoxelStore.getState>): EngineStats {
  const cells = state.cells;
  if (cells.size === 0) {
    return { cellCount: 0, integrity: 1, anomaly: 0, chunkCount: 0, memoryBytes: 0 };
  }
  let stabilitySum = 0;
  let anomalySum = 0;
  for (const id of cells.values()) {
    const b = BLOCK_TYPES[id];
    stabilitySum += b.stability;
    anomalySum += b.anomaly;
  }
  const stability = stabilitySum / cells.size;
  const anomalyPressure = Math.min(1, anomalySum / Math.max(8, cells.size * 0.25));
  const integrity = Math.max(0, Math.min(1, stability * (1 - anomalyPressure * 0.7)));
  const anomaly = Math.min(1, anomalySum / Math.max(1, cells.size));
  // Phase 1 stub: chunkCount/memoryBytes are coarse estimates. Phase 2's
  // worker computes the real numbers from the chunk map.
  const memoryBytes = cells.size * 8; // rough: 1 cell ~= 1 Map entry overhead
  return { cellCount: cells.size, integrity, anomaly, chunkCount: 0, memoryBytes };
}

function chronoEntriesFromHistory(history: HistoryEntry[]): ChronoEntry[] {
  return history.map((h) => ({
    id: h.id,
    label: h.label,
    timestamp: h.timestamp,
    opCount: h.patch.length,
  }));
}

// ---------------------------------------------------------------------------
// VoxelEngine class
// ---------------------------------------------------------------------------

export class VoxelEngine implements IVoxelEngine {
  private emitter = new TypedEmitter();
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private storeUnsub: (() => void) | null = null;
  private statsCache: EngineStats = {
    cellCount: 0,
    integrity: 1,
    anomaly: 0,
    chunkCount: 0,
    memoryBytes: 0,
  };

  // Worker (Phase 2). The worker mirrors voxelStore state and emits PATCH /
  // STATS / CHRONO / LAYERS replies. For Phase 2, voxelStore remains the
  // canonical source for the V1 UI; the worker is a parallel read-replica
  // that future phases will promote to source of truth.
  private worker: Worker | null = null;
  private workerReady = false;

  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      // Subscribe to voxelStore changes to drive engine events. This is the
      // active source of 'patch'/'stats'/'chrono'/'layers' for Phase 2.
      this.storeUnsub = useVoxelStore.subscribe(
        (s) => ({ revision: s.revision, layerRevision: s.layerRevision }),
        (curr, prev) => {
          if (curr.revision !== prev.revision) {
            const state = useVoxelStore.getState();
            this.statsCache = computeStats(state);
            this.emitter.emit({ type: 'stats', stats: this.statsCache });
            this.emitter.emit({
              type: 'chrono',
              entries: chronoEntriesFromHistory(state.history),
            });
          }
          if (curr.layerRevision !== prev.layerRevision) {
            this.emitter.emit({
              type: 'layers',
              layers: [...useVoxelStore.getState().layers],
            });
          }
        },
        { equalityFn: (a, b) => a.revision === b.revision && a.layerRevision === b.layerRevision },
      );

      // Seed the stats cache with current store state.
      this.statsCache = computeStats(useVoxelStore.getState());

      // Spawn the voxel worker. Failure is non-fatal in Phase 2 since the
      // engine API still works via the voxelStore path — we log and proceed.
      try {
        this.spawnVoxelWorker();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VoxelEngine] voxel.worker spawn failed; running without worker:', err);
        this.worker = null;
      }

      this.ready = true;
      this.emitter.emit({ type: 'ready' });
      resolve();
      void reject;
    });
    return this.readyPromise;
  }

  /**
   * Build INIT seed + spawn the voxel worker. Posts the current voxelStore
   * snapshot as seed cells so the worker boots already mirroring V1 state.
   */
  private spawnVoxelWorker(): void {
    const w = new Worker(new URL('../worker/voxel.worker.ts', import.meta.url), {
      type: 'module',
      name: 'voxel-engine',
    });
    this.worker = w;

    w.onmessage = (ev: MessageEvent<VoxelToMainMsg>) => this.handleWorkerMessage(ev.data);
    w.onerror = (ev) => {
      // eslint-disable-next-line no-console
      console.error('[VoxelEngine] worker error', ev.message);
      this.emitter.emit({ type: 'error', message: ev.message || 'voxel.worker error' });
    };

    const state = useVoxelStore.getState();
    const seedCells: WireOp[] = [];
    for (const [k, blockId] of state.cells.entries()) {
      const [x, y, z] = unkey(k);
      seedCells.push({
        x,
        y,
        z,
        blockIndex: blockIdToIndex(blockId),
        layer: y,
      });
    }

    const blockTable: BlockTableEntry[] = BLOCK_INDEX_TABLE.map((id) => {
      if (id === null) {
        return { blockId: '', stability: 0, anomaly: 0, opacity: 0 };
      }
      const b = BLOCK_TYPES[id];
      return {
        blockId: id,
        stability: b.stability,
        anomaly: b.anomaly,
        opacity: b.opacity ?? 1,
      };
    });

    const initMsg: MainToVoxelMsg = {
      type: 'INIT',
      worldX: WORLD_SIZE,
      worldY: WORLD_Y_ROUNDED,
      worldZ: WORLD_SIZE,
      chunkSize: 16,
      historyLimit: ENGINE_CHRONO_LIMIT,
      layers: [...state.layers],
      activeLayer: state.activeLayer,
      blockTable,
      seedCells: seedCells.length > 0 ? seedCells : undefined,
      contract: state.contract,
      statsTickMs: STATS_TICK_MS,
    };
    w.postMessage(initMsg);
  }

  /**
   * Route inbound worker messages. Phase 2: we receive STATS/PATCH/CHRONO/
   * LAYERS but the active event source remains the voxelStore subscription
   * (the worker isn't yet driving mutations). The worker plumbing is here
   * so Phase 3+ can flip the data direction without touching consumers.
   */
  private handleWorkerMessage(msg: VoxelToMainMsg): void {
    switch (msg.type) {
      case 'READY':
        this.workerReady = true;
        break;
      case 'STATS':
        // Cache worker's authoritative stats for future-phase consumers.
        // Phase 2: voxelStore subscription is the live source of the
        // engine 'stats' event, so we do NOT re-emit here.
        this.statsCache = msg.stats;
        break;
      case 'PATCH':
        // Phase 3 will route this to RenderBridge. Until then, no
        // consumer needs worker PATCH output; the voxelStore subscription
        // path emits the engine 'patch' event from V1 mutation flow.
        void this.workerDeltasToEngineDeltas(msg.deltas);
        break;
      case 'CHRONO':
        // Phase 3 takeover candidate.
        break;
      case 'LAYERS':
        // Phase 3 takeover candidate.
        break;
      case 'SERIALIZED_RAW':
        // Phase 5: compress.worker hand-off goes here.
        break;
      case 'ERROR':
        this.emitter.emit({ type: 'error', message: msg.message });
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  /** Translate a WireDelta[] (numeric block indices) to CellDelta[] (BlockId strings). */
  private workerDeltasToEngineDeltas(deltas: WireDelta[]): CellDelta[] {
    const out: CellDelta[] = [];
    for (const d of deltas) {
      out.push({
        cellIdx: d.cellIdx,
        x: d.x,
        y: d.y,
        z: d.z,
        prevBlockId: indexToBlockId(d.prevBlock),
        newBlockId: indexToBlockId(d.newBlock),
        layer: d.layer,
        opacity: d.opacity,
      });
    }
    return out;
  }

  dispose(): void {
    this.storeUnsub?.();
    this.storeUnsub = null;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'DISPOSE' } as MainToVoxelMsg);
      } catch {
        // Worker may already be dead; ignore.
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.workerReady = false;
    this.emitter.dispose();
    this.ready = false;
    this.readyPromise = null;
  }

  // ---- Mutations -----------------------------------------------------------

  applyOps(ops: CellOp[], label: string): void {
    if (ops.length === 0) return;
    const layers = useVoxelStore.getState().layers;
    const prevHistoryLen = useVoxelStore.getState().history.length;

    useVoxelStore.getState().applyOps(
      ops.map((o) => ({ x: o.x, y: o.y, z: o.z, block: o.blockId })),
      label,
    );

    const next = useVoxelStore.getState();
    if (next.history.length > prevHistoryLen) {
      const entry = next.history[next.history.length - 1];
      this.emitter.emit({
        type: 'patch',
        deltas: deltasFromHistoryEntry(entry, 'forward', layers),
        label,
      });
    }
  }

  undo(): void {
    const state = useVoxelStore.getState();
    const entry = state.history[state.history.length - 1];
    if (!entry) return;
    const layers = state.layers;
    state.undo();
    this.emitter.emit({
      type: 'patch',
      deltas: deltasFromHistoryEntry(entry, 'inverse', layers),
      label: `Undo: ${entry.label}`,
    });
  }

  redo(): void {
    const state = useVoxelStore.getState();
    const entry = state.future[state.future.length - 1];
    if (!entry) return;
    const layers = state.layers;
    state.redo();
    this.emitter.emit({
      type: 'patch',
      deltas: deltasFromHistoryEntry(entry, 'forward', layers),
      label: `Redo: ${entry.label}`,
    });
  }

  jumpToChrono(entryId: string): void {
    const state = useVoxelStore.getState();
    const idx = state.history.findIndex((h) => h.id === entryId);
    if (idx === -1) return;
    // Walk back, emitting one inverse-patch per step.
    const stepsBack = state.history.length - 1 - idx;
    for (let i = 0; i < stepsBack; i++) this.undo();
  }

  clearAll(): void {
    const state = useVoxelStore.getState();
    if (state.cells.size === 0) return;
    const layers = state.layers;
    // Snapshot before clearing so we can emit the inverse deltas.
    const snapshot = Array.from(state.cells.entries());
    state.clearAll();
    this.emitter.emit({
      type: 'patch',
      deltas: deltasFromClearedCells(snapshot, layers),
      label: 'Purge Vault',
    });
  }

  loadSave(data: ArrayBuffer): void {
    // Phase 1 stub: V1 JSON format only. Phase 5 detects OBS2 magic and
    // routes to the binary path. V1 example saves stay JSON.
    const json = new TextDecoder().decode(new Uint8Array(data));
    const save = JSON.parse(json) as SerializedSave;
    const state = useVoxelStore.getState();
    state.loadSave(save);
    const next = useVoxelStore.getState();
    this.emitter.emit({
      type: 'patch',
      deltas: deltasFromLoadedCells(next.cells, next.layers),
      label: `Load: ${save.name ?? 'vault'}`,
      clearBeforeApply: true,
    });
  }

  // ---- Layer control -------------------------------------------------------

  setActiveLayer(id: number): void {
    useVoxelStore.getState().setActiveLayer(id);
    // V1 store doesn't bump layerRevision for active-layer change, so emit
    // a synthetic layers event so subscribers can pick up activeLayer.
    this.emitter.emit({ type: 'layers', layers: [...useVoxelStore.getState().layers] });
  }

  setLayerVisibility(id: number, visible: boolean): void {
    const state = useVoxelStore.getState();
    const layer = state.layers.find((l) => l.id === id);
    if (!layer || layer.visible === visible) return;
    state.toggleLayerVisibility(id);
  }

  setLayerLock(id: number, locked: boolean): void {
    const state = useVoxelStore.getState();
    const layer = state.layers.find((l) => l.id === id);
    if (!layer || layer.locked === locked) return;
    state.toggleLayerLock(id);
  }

  setLayerSolo(id: number, solo: boolean): void {
    const state = useVoxelStore.getState();
    const layer = state.layers.find((l) => l.id === id);
    if (!layer) return;
    // V1's toggleLayerSolo flips, so only call if it would land on `solo`.
    if (layer.solo === solo) {
      // Already in desired state, but if turning ON we must clear other solos.
      // V1's impl already enforces single-solo; toggling twice would clear.
      return;
    }
    state.toggleLayerSolo(id);
  }

  setLayerOpacity(id: number, opacity: number): void {
    useVoxelStore.getState().setLayerOpacity(id, opacity);
  }

  moveLayer(from: number, to: number): void {
    useVoxelStore.getState().moveLayer(from, to);
  }

  renameLayer(id: number, name: string): void {
    useVoxelStore.getState().renameLayer(id, name);
  }

  // ---- Sync reads ----------------------------------------------------------

  getStats(): EngineStats {
    return this.statsCache;
  }

  getChronoEntries(): ChronoEntry[] {
    return chronoEntriesFromHistory(useVoxelStore.getState().history);
  }

  getLayers(): LayerMeta[] {
    return [...useVoxelStore.getState().layers];
  }

  getActiveLayer(): number {
    return useVoxelStore.getState().activeLayer;
  }

  // ---- Async I/O -----------------------------------------------------------

  getAllCells(): CellDelta[] {
    const state = useVoxelStore.getState();
    return deltasFromLoadedCells(state.cells, state.layers);
  }

  async serialize(): Promise<ArrayBuffer> {
    // Phase 1 stub: emit V1 JSON format wrapped in an ArrayBuffer. Phase 5
    // swaps this for OBS2 binary via compress.worker.
    const state = useVoxelStore.getState();
    const cells: Array<[number, number, number, BlockId]> = [];
    for (const [k, v] of state.cells.entries()) {
      const [x, y, z] = unkey(k);
      cells.push([x, y, z, v]);
    }
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const [x, y, z] of cells) {
      if (x < mnx) mnx = x;
      if (y < mny) mny = y;
      if (z < mnz) mnz = z;
      if (x > mxx) mxx = x;
      if (y > mxy) mxy = y;
      if (z > mxz) mxz = z;
    }
    const bounds = cells.length
      ? { min: [mnx, mny, mnz] as [number, number, number], max: [mxx, mxy, mxz] as [number, number, number] }
      : { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
    const save: SerializedSave = {
      version: 1,
      name: 'vault',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bounds,
      layers: state.layers,
      cells,
      contract: state.contract ?? undefined,
    };
    const json = JSON.stringify(save);
    const buf = new TextEncoder().encode(json);
    // Return the underlying buffer (slice to avoid SharedArrayBuffer typing).
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  async raycast(): Promise<RaycastResult | null> {
    // Phase 4 wires this to the raycast worker. The V1 Interaction component
    // still uses Three.js's built-in raycaster, so this stub is unused today.
    return null;
  }

  // ---- Contract pass-through ----------------------------------------------

  getContract(): Contract | null {
    return useVoxelStore.getState().contract;
  }

  setContract(c: Contract | null): void {
    useVoxelStore.getState().setContract(c);
  }

  // ---- Subscriptions -------------------------------------------------------

  on<T extends EngineEventType>(event: T, handler: EngineEventHandler<T>): () => void {
    return this.emitter.on(event, handler);
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _engine: VoxelEngine | null = null;

export function getVoxelEngine(): VoxelEngine {
  if (!_engine) _engine = new VoxelEngine();
  return _engine;
}

/** Test / HMR helper. Disposes the singleton so the next get() creates fresh. */
export function __resetVoxelEngineForTests(): void {
  _engine?.dispose();
  _engine = null;
}
