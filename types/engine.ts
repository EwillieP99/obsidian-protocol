// V2 engine API surface. Everything the UI sees crosses this boundary.
// Nothing in `engine/` imports React/Zustand; nothing in `components/` imports
// from `engine/` directly — UI talks to the engine through hooks/useEngine.

import type { BlockId, VoxelLayer, Contract } from './index';

// Re-export VoxelLayer under the engine-facing name. They're the same shape
// today; keeping a distinct name lets us evolve LayerMeta without breaking
// V1's persistence type.
export type LayerMeta = VoxelLayer;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CellOp {
  x: number;
  y: number;
  z: number;
  blockId: BlockId | null; // null = erase
  layer: number;
}

// ---------------------------------------------------------------------------
// Outputs (worker -> main -> UI)
// ---------------------------------------------------------------------------

// Per-cell change emitted by the worker after APPLY_OPS / UNDO / REDO / JUMP /
// LOAD / CLEAR. The RenderBridge consumes these to update GPU buffers; the
// effect bindings hook consumes them to spawn particles / audio / shake.
export interface CellDelta {
  cellIdx: number; // global linear index (y * WORLD_XZ + z * WORLD_X + x)
  x: number;
  y: number;
  z: number;
  prevBlockId: BlockId | null;
  newBlockId: BlockId | null;
  layer: number;
  opacity: number; // baked layer opacity * block opacity, 0..1
}

export interface EngineStats {
  cellCount: number;
  integrity: number; // 0..1 weighted stability avg
  anomaly: number; // 0..1 weighted anomaly avg
  chunkCount: number;
  memoryBytes: number;
}

// Lore-accurate name for an undo/redo entry. The Chrono-Log lets the user
// scrub back through every mutation to the Vault.
export interface ChronoEntry {
  id: string;
  label: string;
  timestamp: number;
  opCount: number;
}

export interface RaycastResult {
  cell: [number, number, number];
  face: [number, number, number];
  blockId: BlockId;
  isAdjacentFace: boolean;
}

// ---------------------------------------------------------------------------
// Event union (engine.on subscriptions)
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { type: 'patch'; deltas: CellDelta[]; label: string; clearBeforeApply?: boolean }
  | { type: 'stats'; stats: EngineStats }
  | { type: 'chrono'; entries: ChronoEntry[] }
  | { type: 'layers'; layers: LayerMeta[] }
  | { type: 'ready' }
  | { type: 'error'; message: string };

export type EngineEventType = EngineEvent['type'];

export type EngineEventHandler<T extends EngineEventType> = (
  event: Extract<EngineEvent, { type: T }>,
) => void;

// ---------------------------------------------------------------------------
// Public engine interface
// ---------------------------------------------------------------------------

export interface IVoxelEngine {
  // ---- Mutations (fire-and-forget; 'patch' + 'stats' fire on completion) ----
  applyOps(ops: CellOp[], label: string): void;
  undo(): void;
  redo(): void;
  jumpToChrono(entryId: string): void;
  clearAll(): void;
  loadSave(data: ArrayBuffer): void;

  // ---- Layer control (sync dispatch; 'layers' + 'patch' fire) ----
  setActiveLayer(id: number): void;
  setLayerVisibility(id: number, visible: boolean): void;
  setLayerLock(id: number, locked: boolean): void;
  setLayerSolo(id: number, solo: boolean): void;
  setLayerOpacity(id: number, opacity: number): void;
  moveLayer(from: number, to: number): void;
  renameLayer(id: number, name: string): void;

  // ---- Sync reads (cached on main thread; safe to call every frame) ----
  getStats(): EngineStats;
  getChronoEntries(): ChronoEntry[];
  getLayers(): LayerMeta[];
  getActiveLayer(): number;

  // ---- Async I/O ----
  serialize(): Promise<ArrayBuffer>;
  raycast(
    origin: [number, number, number],
    direction: [number, number, number],
  ): Promise<RaycastResult | null>;

  // ---- Bulk read (for initial bridge seed) ----
  getAllCells(): CellDelta[];

  // ---- Lifecycle / subscriptions ----
  init(): Promise<void>;
  dispose(): void;
  on<T extends EngineEventType>(event: T, handler: EngineEventHandler<T>): () => void;

  // ---- Contract pass-through (so UI doesn't have to mutate engine state directly) ----
  getContract(): Contract | null;
  setContract(c: Contract | null): void;
}
