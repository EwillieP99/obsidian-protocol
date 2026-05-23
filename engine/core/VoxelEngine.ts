'use client';

// VoxelEngine — Phase 3.5: voxelStore fully retired.
//
// All state lives either in the worker (canonical) or in main-thread caches
// that are kept in sync by worker replies. No Zustand, no React imports here.
//
// Black-box rule: no React imports, no Three.js imports. Pure TS.

import { BLOCK_INDEX_TABLE, BLOCK_TYPES, blockIdToIndex, indexToBlockId } from '@/lib/blocks';
import { ENGINE_CHRONO_LIMIT, STATS_TICK_MS, WORLD_HEIGHT, WORLD_SIZE, WORLD_Y_ROUNDED } from '@/lib/constants';
import { cellLinearIdx, key, unkey, inWorld } from '@/lib/utils';
import type { BlockId, Contract, SerializedSave } from '@/types';
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
  CompressToMainMsg,
  MainToCompressMsg,
  MainToRaycastMsg,
  MainToVoxelMsg,
  RaycastToMainMsg,
  VoxelToMainMsg,
  WireDelta,
  WireOp,
  WireRayHit,
} from '@/engine/bridge/WorkerProtocol';
import { isOBS2 } from '@/engine/persist/obs2';

// Inbound message variants the engine awaits via pending-promise maps.
type SerializedRawMsg = Extract<VoxelToMainMsg, { type: 'SERIALIZED_RAW' }>;
type DecodedMsg = Extract<CompressToMainMsg, { type: 'DECODED' }>;

// ---------------------------------------------------------------------------
// Default layer configuration (moved here from voxelStore)
// ---------------------------------------------------------------------------

function makeDefaultLayers(): LayerMeta[] {
  return Array.from({ length: WORLD_HEIGHT }, (_, i) => ({
    id: i,
    name: i === 0 ? 'Foundation' : i === WORLD_HEIGHT - 1 ? 'Spire Crown' : `Layer ${i.toString().padStart(2, '0')}`,
    visible: true,
    locked: false,
    solo: false,
    order: WORLD_HEIGHT - 1 - i,
    opacity: 1,
  }));
}

// ---------------------------------------------------------------------------
// Typed event emitter
// ---------------------------------------------------------------------------

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
    for (const h of Array.from(set)) {
      try {
        h(event);
      } catch (err) {
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
// Helpers — used by loadSave's synchronous patch emission
// ---------------------------------------------------------------------------

const SERIALIZE_TIMEOUT_MS = 30_000;
const RAYCAST_TIMEOUT_MS = 5_000;
const DECODE_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function rejectPendingMap<K>(
  map: Map<K, { reject: (err: Error) => void }>,
  err: Error,
): void {
  for (const pending of map.values()) pending.reject(err);
  map.clear();
}

function validateSerializedSave(save: SerializedSave): void {
  if (!Array.isArray(save.cells)) throw new Error('Invalid save: cells must be an array');
  for (const entry of save.cells) {
    if (!Array.isArray(entry) || entry.length !== 4) {
      throw new Error('Invalid save: malformed cell entry');
    }
    const [x, y, z, blockId] = entry;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      throw new Error('Invalid save: cell coordinates must be numbers');
    }
    if (!inWorld(x, y, z)) {
      throw new Error(`Invalid save: cell out of bounds (${x},${y},${z})`);
    }
    if (blockId !== null) blockIdToIndex(blockId as BlockId);
  }
}

function bakedOpacity(blockId: BlockId | null, layer: LayerMeta | undefined): number {
  if (blockId === null) return 0;
  const block = BLOCK_TYPES[blockId];
  const blockOpacity = block.opacity ?? 1;
  const layerOpacity = layer?.opacity ?? 1;
  return Math.max(0, Math.min(1, blockOpacity * layerOpacity));
}

function deltasFromCells(cells: Map<string, BlockId>, layers: LayerMeta[]): CellDelta[] {
  const out: CellDelta[] = [];
  for (const [k, next] of cells.entries()) {
    const [x, y, z] = unkey(k);
    const layer = layers.find((l) => l.id === y);
    out.push({
      cellIdx: cellLinearIdx(x, y, z),
      x, y, z,
      prevBlockId: null,
      newBlockId: next,
      layer: y,
      opacity: bakedOpacity(next, layer),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// VoxelEngine class
// ---------------------------------------------------------------------------

export class VoxelEngine implements IVoxelEngine {
  private emitter = new TypedEmitter();
  private ready = false;
  private readyPromise: Promise<void> | null = null;

  // Main-thread caches — driven by worker replies.
  private statsCache: EngineStats = { cellCount: 0, integrity: 1, anomaly: 0, chunkCount: 0, memoryBytes: 0 };
  private chronoCache: ChronoEntry[] = [];
  private futureCache: ChronoEntry[] = [];
  private layersCache: LayerMeta[] = makeDefaultLayers();
  private activeLayerCache: number = 0;
  private contractCache: Contract | null = null;

  // Shadow cell map — kept in sync from PATCH replies and loadSave.
  // Used by getAllCells(), getBlock(), and serialize() until Phase 5 replaces serialize().
  private localCells: Map<string, BlockId> = new Map();

  private worker: Worker | null = null;
  private workerReady = false;

  // Phase 4 — raycast worker. The MessageChannel between voxel.worker and
  // raycast.worker is owned by the engine; we hand one port to each at INIT.
  private raycastWorker: Worker | null = null;
  private raycastReady = false;
  private raycastReqSeq = 0;
  private pendingRaycasts = new Map<
    number,
    { resolve: (v: RaycastResult | null) => void; reject: (err: Error) => void }
  >();

  // Phase 5 — compress worker (stateless OBS2 codec). serialize() round-trips
  // SERIALIZE -> SERIALIZED_RAW (voxel.worker) -> ENCODE -> ENCODED (here).
  private compressWorker: Worker | null = null;
  private compressReady = false;
  private compressReqSeq = 0;
  private pendingSerialize = new Map<
    number,
    { resolve: (msg: SerializedRawMsg) => void; reject: (err: Error) => void }
  >();
  private pendingEncode = new Map<
    number,
    { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }
  >();
  private pendingDecode = new Map<
    number,
    { resolve: (msg: DecodedMsg) => void; reject: (err: Error) => void }
  >();

  init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        this.spawnRaycastWorker();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VoxelEngine] raycast.worker spawn failed; raycast() will return null:', err);
        this.raycastWorker = null;
      }
      try {
        this.spawnVoxelWorker();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VoxelEngine] voxel.worker spawn failed; running without worker:', err);
        this.worker = null;
      }
      try {
        this.spawnCompressWorker();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VoxelEngine] compress.worker spawn failed; serialize() falls back to JSON:', err);
        this.compressWorker = null;
      }

      this.ready = true;
      this.emitter.emit({ type: 'ready' });
      resolve();
      void reject;
    });
    return this.readyPromise;
  }

  private buildBlockTable(): BlockTableEntry[] {
    return BLOCK_INDEX_TABLE.map((id) => {
      if (id === null) return { blockId: '', stability: 0, anomaly: 0, opacity: 0 };
      const b = BLOCK_TYPES[id];
      return { blockId: id, stability: b.stability, anomaly: b.anomaly, opacity: b.opacity ?? 1 };
    });
  }

  private buildSeedOps(cells: Map<string, BlockId>): WireOp[] {
    const out: WireOp[] = [];
    for (const [k, blockId] of cells.entries()) {
      const [x, y, z] = unkey(k);
      out.push({ x, y, z, blockIndex: blockIdToIndex(blockId), layer: y });
    }
    return out;
  }

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

    this.postVoxelInit(undefined);
  }

  private spawnRaycastWorker(): void {
    const w = new Worker(new URL('../worker/raycast.worker.ts', import.meta.url), {
      type: 'module',
      name: 'raycast-engine',
    });
    this.raycastWorker = w;
    this.raycastReady = false;

    w.onmessage = (ev: MessageEvent<RaycastToMainMsg>) => this.handleRaycastMessage(ev.data);
    w.onerror = (ev) => {
      // eslint-disable-next-line no-console
      console.error('[VoxelEngine] raycast worker error', ev.message);
      this.emitter.emit({ type: 'error', message: ev.message || 'raycast.worker error' });
    };
  }

  private spawnCompressWorker(): void {
    const w = new Worker(new URL('../worker/compress.worker.ts', import.meta.url), {
      type: 'module',
      name: 'compress-engine',
    });
    this.compressWorker = w;
    this.compressReady = false;

    w.onmessage = (ev: MessageEvent<CompressToMainMsg>) => this.handleCompressMessage(ev.data);
    w.onerror = (ev) => {
      // eslint-disable-next-line no-console
      console.error('[VoxelEngine] compress worker error', ev.message);
      this.emitter.emit({ type: 'error', message: ev.message || 'compress.worker error' });
    };

    w.postMessage({ type: 'INIT' } satisfies MainToCompressMsg);
  }

  private handleCompressMessage(msg: CompressToMainMsg): void {
    switch (msg.type) {
      case 'READY':
        this.compressReady = true;
        break;
      case 'ENCODED': {
        const pending = this.pendingEncode.get(msg.requestId);
        if (!pending) return;
        this.pendingEncode.delete(msg.requestId);
        pending.resolve(msg.buffer);
        break;
      }
      case 'DECODED': {
        const pending = this.pendingDecode.get(msg.requestId);
        if (!pending) return;
        this.pendingDecode.delete(msg.requestId);
        pending.resolve(msg);
        break;
      }
      case 'ERROR': {
        // eslint-disable-next-line no-console
        console.error('[VoxelEngine] compress.worker error:', msg.message);
        if (msg.requestId !== undefined) {
          const err = new Error(msg.message);
          this.pendingEncode.get(msg.requestId)?.reject(err);
          this.pendingEncode.delete(msg.requestId);
          this.pendingDecode.get(msg.requestId)?.reject(err);
          this.pendingDecode.delete(msg.requestId);
        }
        this.emitter.emit({ type: 'error', message: msg.message });
        break;
      }
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  /**
   * Send INIT to voxel.worker. Always opens a fresh MessageChannel for the
   * voxel<->raycast bridge: re-INIT (loadSave path) discards the old channel
   * by closing the previous ports inside each worker's INIT handler.
   */
  private postVoxelInit(seedCells: WireOp[] | undefined): void {
    if (!this.worker) return;
    let raycastPort: MessagePort | undefined;
    if (this.raycastWorker) {
      const channel = new MessageChannel();
      raycastPort = channel.port1;
      // Hand the matching port to the raycast worker so it can listen to
      // OCCUPANCY_DELTA messages from voxel.worker.
      this.raycastWorker.postMessage(
        {
          type: 'INIT',
          worldX: WORLD_SIZE,
          worldY: WORLD_Y_ROUNDED,
          worldZ: WORLD_SIZE,
          voxelPort: channel.port2,
        } satisfies MainToRaycastMsg,
        [channel.port2],
      );
    }

    const initMsg: MainToVoxelMsg = {
      type: 'INIT',
      worldX: WORLD_SIZE,
      worldY: WORLD_Y_ROUNDED,
      worldZ: WORLD_SIZE,
      chunkSize: 16,
      historyLimit: ENGINE_CHRONO_LIMIT,
      layers: [...this.layersCache],
      activeLayer: this.activeLayerCache,
      blockTable: this.buildBlockTable(),
      seedCells,
      contract: this.contractCache,
      statsTickMs: STATS_TICK_MS,
      ...(raycastPort ? { raycastPort } : {}),
    };
    this.worker.postMessage(initMsg, raycastPort ? [raycastPort] : []);
  }

  private handleRaycastMessage(msg: RaycastToMainMsg): void {
    switch (msg.type) {
      case 'READY':
        this.raycastReady = true;
        break;
      case 'RAY_RESULT': {
        const pending = this.pendingRaycasts.get(msg.requestId);
        if (!pending) return;
        this.pendingRaycasts.delete(msg.requestId);
        pending.resolve(this.wireHitToResult(msg.hit));
        break;
      }
      case 'ERROR':
        // eslint-disable-next-line no-console
        console.error('[VoxelEngine] raycast.worker error:', msg.message);
        rejectPendingMap(this.pendingRaycasts, new Error(msg.message));
        this.emitter.emit({ type: 'error', message: msg.message });
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  private wireHitToResult(hit: WireRayHit | null): RaycastResult | null {
    if (!hit) return null;
    const id = indexToBlockId(hit.blockIndex);
    if (id === null) return null;
    return {
      cell: hit.cell,
      face: hit.face,
      blockId: id,
      isAdjacentFace: hit.isAdjacentFace,
    };
  }

  private handleWorkerMessage(msg: VoxelToMainMsg): void {
    switch (msg.type) {
      case 'READY':
        this.workerReady = true;
        break;

      case 'PATCH': {
        const deltas = this.workerDeltasToEngineDeltas(msg.deltas);
        this.applyDeltasToLocalCells(msg.deltas);
        this.emitter.emit({ type: 'patch', deltas, label: msg.label });
        break;
      }

      case 'STATS':
        this.statsCache = msg.stats;
        this.emitter.emit({ type: 'stats', stats: msg.stats });
        break;

      case 'CHRONO':
        this.chronoCache = msg.entries;
        this.futureCache = msg.futureEntries;
        this.emitter.emit({ type: 'chrono', entries: msg.entries, futureEntries: msg.futureEntries });
        break;

      case 'LAYERS':
        this.layersCache = msg.layers;
        this.activeLayerCache = msg.activeLayer;
        this.emitter.emit({ type: 'layers', layers: msg.layers, activeLayer: msg.activeLayer });
        break;

      case 'SERIALIZED_RAW': {
        const pending = this.pendingSerialize.get(msg.requestId);
        if (!pending) break;
        this.pendingSerialize.delete(msg.requestId);
        pending.resolve(msg);
        break;
      }

      case 'ERROR':
        rejectPendingMap(this.pendingSerialize, new Error(msg.message));
        this.emitter.emit({ type: 'error', message: msg.message });
        break;

      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  private workerDeltasToEngineDeltas(deltas: WireDelta[]): CellDelta[] {
    return deltas.map((d) => ({
      cellIdx: d.cellIdx,
      x: d.x, y: d.y, z: d.z,
      prevBlockId: indexToBlockId(d.prevBlock),
      newBlockId: indexToBlockId(d.newBlock),
      layer: d.layer,
      opacity: d.opacity,
    }));
  }

  private applyDeltasToLocalCells(deltas: WireDelta[]): void {
    for (const d of deltas) {
      const k = key(d.x, d.y, d.z);
      if (d.newBlock === 0) {
        this.localCells.delete(k);
      } else {
        const id = indexToBlockId(d.newBlock);
        if (id !== null) this.localCells.set(k, id);
      }
    }
  }

  private postToWorker(msg: MainToVoxelMsg): void {
    if (!this.worker || !this.workerReady) {
      // eslint-disable-next-line no-console
      console.warn('[VoxelEngine] postToWorker called before worker ready; dropping:', msg.type);
      return;
    }
    this.worker.postMessage(msg);
  }

  dispose(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'DISPOSE' } as MainToVoxelMsg);
      } catch {
        // Worker may already be dead.
      }
      this.worker.terminate();
      this.worker = null;
    }
    if (this.raycastWorker) {
      try {
        this.raycastWorker.postMessage({ type: 'DISPOSE' } as MainToRaycastMsg);
      } catch {
        // Worker may already be dead.
      }
      this.raycastWorker.terminate();
      this.raycastWorker = null;
    }
    if (this.compressWorker) {
      try {
        this.compressWorker.postMessage({ type: 'DISPOSE' } satisfies MainToCompressMsg);
      } catch {
        // Worker may already be dead.
      }
      this.compressWorker.terminate();
      this.compressWorker = null;
    }
    // Reject any in-flight ray queries so callers don't hang forever.
    for (const pending of this.pendingRaycasts.values()) {
      pending.resolve(null);
    }
    this.pendingRaycasts.clear();
    // Reject in-flight serialize/encode/decode promises so awaiters unblock.
    const disposed = new Error('VoxelEngine disposed');
    for (const p of this.pendingSerialize.values()) p.reject(disposed);
    this.pendingSerialize.clear();
    for (const p of this.pendingEncode.values()) p.reject(disposed);
    this.pendingEncode.clear();
    for (const p of this.pendingDecode.values()) p.reject(disposed);
    this.pendingDecode.clear();
    this.raycastReady = false;
    this.compressReady = false;
    this.workerReady = false;
    this.emitter.dispose();
    this.ready = false;
    this.readyPromise = null;
  }

  // ---- Mutations -----------------------------------------------------------

  applyOps(ops: CellOp[], label: string): void {
    if (ops.length === 0) return;
    this.postToWorker({
      type: 'APPLY_OPS',
      ops: ops.map((o) => ({
        x: o.x, y: o.y, z: o.z,
        blockIndex: o.blockId !== null ? blockIdToIndex(o.blockId) : 0,
        layer: o.layer,
      })),
      label,
    });
  }

  undo(): void {
    this.postToWorker({ type: 'UNDO' });
  }

  redo(): void {
    this.postToWorker({ type: 'REDO' });
  }

  jumpToChrono(entryId: string): void {
    this.postToWorker({ type: 'JUMP_TO_CHRONO', entryId });
  }

  clearAll(): void {
    this.postToWorker({ type: 'CLEAR_ALL' });
  }

  loadSave(data: ArrayBuffer): void {
    // Binary OBS2 save → decode off-thread, then re-seed via the same path the
    // JSON loader uses. Legacy JSON saves (and the case where the compress
    // worker failed to spawn) fall through to the V1 parser below.
    if (isOBS2(data) && this.compressWorker && this.compressReady) {
      this.loadSaveOBS2(data);
      return;
    }

    try {
      const json = new TextDecoder().decode(new Uint8Array(data));
      const save = JSON.parse(json) as SerializedSave;
      validateSerializedSave(save);

      // Update local caches immediately so sync reads stay consistent.
      this.localCells = new Map(save.cells.map(([x, y, z, b]) => [key(x, y, z), b]));
      const layers = save.layers.length > 0 ? save.layers : makeDefaultLayers();
      this.layersCache = layers;
      this.activeLayerCache = 0;
      this.contractCache = save.contract ?? null;
      this.chronoCache = [];
      this.futureCache = [];

      // Emit patch event so RenderBridge clears and rebuilds from the new cells.
      this.emitter.emit({
        type: 'patch',
        deltas: deltasFromCells(this.localCells, this.layersCache),
        label: `Load: ${save.name ?? 'vault'}`,
        clearBeforeApply: true,
      });

      // Emit layers and contract events so UI components that subscribe update.
      this.emitter.emit({ type: 'layers', layers: this.layersCache, activeLayer: 0 });
      this.emitter.emit({ type: 'contract', contract: this.contractCache });

      // Re-seed the worker. Worker will reply READY / LAYERS / CHRONO / STATS.
      // A fresh MessageChannel is opened inside postVoxelInit so the raycast
      // worker resets its occupancy buffer for the new world.
      if (this.worker) {
        this.postVoxelInit(this.buildSeedOps(this.localCells));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[VoxelEngine] JSON load failed:', message);
      this.emitter.emit({ type: 'error', message: `Load failed: ${message}` });
    }
  }

  /**
   * OBS2 load path. Decodes off the main thread on the compress worker, then
   * rebuilds the shadow cell map, emits the same clear+patch / layers /
   * contract events the JSON loader emits, and re-seeds the voxel worker via
   * INIT. loadSave() stays `void` (UI doesn't await it); errors surface as an
   * 'error' event.
   */
  private loadSaveOBS2(data: ArrayBuffer): void {
    const requestId = ++this.compressReqSeq;
    withTimeout(
      new Promise<DecodedMsg>((resolve, reject) => {
        this.pendingDecode.set(requestId, { resolve, reject });
        // No transfer: decode is rare and keeping the source buffer valid avoids
        // surprising any caller that still references it.
        this.compressWorker!.postMessage({ type: 'DECODE', requestId, buffer: data } satisfies MainToCompressMsg);
      }),
      DECODE_TIMEOUT_MS,
      'OBS2 decode',
    )
      .then((decoded) => {
        const cells = new Map<string, BlockId>();
        for (const ce of decoded.chunks) {
          const arr = new Uint16Array(ce.data);
          for (let li = 0; li < arr.length; li++) {
            const blockIndex = arr[li] & 0xff;
            if (blockIndex === 0) continue;
            const id = indexToBlockId(blockIndex);
            if (id === null) continue;
            const lx = li & 0xf;
            const lz = (li >> 4) & 0xf;
            const ly = (li >> 8) & 0xf;
            cells.set(key(ce.cx * 16 + lx, ce.cy * 16 + ly, ce.cz * 16 + lz), id);
          }
        }

        this.localCells = cells;
        this.layersCache = decoded.layers.length > 0 ? decoded.layers : makeDefaultLayers();
        this.activeLayerCache = 0;
        this.contractCache = decoded.contract ?? null;
        this.chronoCache = [];
        this.futureCache = [];

        this.emitter.emit({
          type: 'patch',
          deltas: deltasFromCells(this.localCells, this.layersCache),
          label: `Load: ${decoded.name || 'vault'}`,
          clearBeforeApply: true,
        });
        this.emitter.emit({ type: 'layers', layers: this.layersCache, activeLayer: 0 });
        this.emitter.emit({ type: 'contract', contract: this.contractCache });

        if (this.worker) {
          this.postVoxelInit(this.buildSeedOps(this.localCells));
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[VoxelEngine] OBS2 load failed:', err);
        this.emitter.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }

  // ---- Layer control -------------------------------------------------------

  setActiveLayer(id: number): void {
    this.postToWorker({ type: 'SET_ACTIVE_LAYER', id });
  }

  setLayerVisibility(id: number, visible: boolean): void {
    this.postToWorker({ type: 'SET_LAYER_VISIBILITY', id, visible });
  }

  setLayerLock(id: number, locked: boolean): void {
    this.postToWorker({ type: 'SET_LAYER_LOCK', id, locked });
  }

  setLayerSolo(id: number, solo: boolean): void {
    this.postToWorker({ type: 'SET_LAYER_SOLO', id, solo });
  }

  setLayerOpacity(id: number, opacity: number): void {
    this.postToWorker({ type: 'SET_LAYER_OPACITY', id, opacity });
  }

  moveLayer(from: number, to: number): void {
    this.postToWorker({ type: 'MOVE_LAYER', from, to });
  }

  renameLayer(id: number, name: string): void {
    this.postToWorker({ type: 'RENAME_LAYER', id, name });
  }

  // ---- Sync reads ----------------------------------------------------------

  getStats(): EngineStats { return this.statsCache; }
  getChronoEntries(): ChronoEntry[] { return this.chronoCache; }
  getChronoFuture(): ChronoEntry[] { return this.futureCache; }
  getLayers(): LayerMeta[] { return [...this.layersCache]; }
  getActiveLayer(): number { return this.activeLayerCache; }

  getBlock(x: number, y: number, z: number): BlockId | undefined {
    return this.localCells.get(key(x, y, z));
  }

  // ---- Async I/O -----------------------------------------------------------

  getAllCells(): CellDelta[] {
    return deltasFromCells(this.localCells, this.layersCache);
  }

  async serialize(name?: string, thumbnail?: string): Promise<ArrayBuffer> {
    // Binary OBS2 path needs both the voxel worker (to export raw chunks) and
    // the compress worker (to encode). If either is unavailable — e.g. a worker
    // failed to spawn — fall back to the V1 JSON encoder so saves never break.
    if (!this.worker || !this.workerReady || !this.compressWorker || !this.compressReady) {
      return this.serializeLegacyJSON(name);
    }

    const serializeId = ++this.compressReqSeq;
    const raw = await withTimeout(
      new Promise<SerializedRawMsg>((resolve, reject) => {
        this.pendingSerialize.set(serializeId, { resolve, reject });
        this.worker!.postMessage({
          type: 'SERIALIZE',
          requestId: serializeId,
          name: name ?? 'vault',
          thumbnail,
        } satisfies MainToVoxelMsg);
      }),
      SERIALIZE_TIMEOUT_MS,
      'serialize',
    );

    const encodeId = ++this.compressReqSeq;
    return withTimeout(
      new Promise<ArrayBuffer>((resolve, reject) => {
        this.pendingEncode.set(encodeId, { resolve, reject });
        // Transfer the cloned chunk buffers onward to the encoder (zero-copy).
        this.compressWorker!.postMessage(
          {
            type: 'ENCODE',
            requestId: encodeId,
            chunks: raw.chunks,
            layers: raw.layers,
            contract: raw.contract,
            name: raw.name,
            thumbnail: raw.thumbnail,
            cellCount: raw.cellCount,
          } satisfies MainToCompressMsg,
          raw.chunks.map((c) => c.data),
        );
      }),
      SERIALIZE_TIMEOUT_MS,
      'encode',
    );
  }

  private async serializeLegacyJSON(name?: string): Promise<ArrayBuffer> {
    const cells: Array<[number, number, number, BlockId]> = [];
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const [k, v] of this.localCells.entries()) {
      const [x, y, z] = unkey(k);
      cells.push([x, y, z, v]);
      if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
      if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
    }
    const bounds = cells.length
      ? { min: [mnx, mny, mnz] as [number, number, number], max: [mxx, mxy, mxz] as [number, number, number] }
      : { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
    const save: SerializedSave = {
      version: 1,
      name: name ?? 'vault',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bounds,
      layers: this.layersCache,
      cells,
      contract: this.contractCache ?? undefined,
    };
    const buf = new TextEncoder().encode(JSON.stringify(save));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  async raycast(
    origin: [number, number, number],
    direction: [number, number, number],
  ): Promise<RaycastResult | null> {
    const w = this.raycastWorker;
    if (!w || !this.raycastReady) return null;
    const requestId = ++this.raycastReqSeq;
    return withTimeout(
      new Promise<RaycastResult | null>((resolve, reject) => {
        this.pendingRaycasts.set(requestId, { resolve, reject });
        w.postMessage({
          type: 'RAY_QUERY',
          requestId,
          origin,
          direction,
        } satisfies MainToRaycastMsg);
      }),
      RAYCAST_TIMEOUT_MS,
      'raycast',
    );
  }

  // ---- Contract ------------------------------------------------------------

  getContract(): Contract | null {
    return this.contractCache;
  }

  setContract(c: Contract | null): void {
    this.contractCache = c;
    this.postToWorker({ type: 'SET_CONTRACT', contract: c });
    this.emitter.emit({ type: 'contract', contract: c });
  }

  // ---- Subscriptions -------------------------------------------------------

  isDegraded(): boolean {
    return !this.worker || !this.workerReady;
  }

  isWorkerReady(): boolean {
    return !!this.worker && this.workerReady;
  }

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

export function __resetVoxelEngineForTests(): void {
  _engine?.dispose();
  _engine = null;
}
