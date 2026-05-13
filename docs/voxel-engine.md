# Voxel Engine Deep Dive

The voxel engine is the technical heart of Obsidian Protocol. V2 is a from-scratch rebuild that moves all voxel state off the main thread; V1 is preserved as a fallback / read-cache while the migration finishes.

> **Status:** V2 scaffolding at `5f215f9`; RenderBridge + worker re-INIT at `2d42765`; Phases 3.3+3.4 shipped at `2322016` — `Voxels.tsx` is now the RenderBridge thin wrapper and all mutation sites route through `IVoxelEngine`. Phase 3.2 (worker as true mutation authority, retire storeUnsub) is next. See [V1 Autopsy](v1_autopsy.md) for the original problem statement.

---

## V2 — Worker-Backed Engine

The V2 engine is three layers connected by a typed message protocol:

```
┌─ MAIN THREAD ────────────────────────────────────────────┐  ┌─ WORKER ─────────┐
│                                                          │  │                  │
│   React UI ── engine.applyOps(ops) ── postMessage ───────┼─►│  voxel.worker    │
│                                                          │  │                  │
│   RenderBridge ◄── 'patch' event ◄── VoxelEngine ◄───────┼──│  chunks Map      │
│         │                                                │  │  chronoLog       │
│         ▼                                                │  │  layers          │
│   InstancedMesh × 12 (pre-allocated MAX_INSTANCES)       │  │  stats counters  │
│                                                          │  │                  │
└──────────────────────────────────────────────────────────┘  └──────────────────┘
```

### The API surface

`types/engine.ts:IVoxelEngine` is the entire contract between React and the engine. UI code only sees:

```ts
interface IVoxelEngine {
  // Mutations (fire-and-forget; 'patch' + 'stats' fire on completion)
  applyOps(ops: CellOp[], label: string): void;
  undo(): void;
  redo(): void;
  jumpToChrono(entryId: string): void;
  clearAll(): void;
  loadSave(data: ArrayBuffer): void;

  // Layer control
  setActiveLayer(id: number): void;
  setLayerVisibility(id: number, visible: boolean): void;
  setLayerLock(id: number, locked: boolean): void;
  setLayerSolo(id: number, solo: boolean): void;
  setLayerOpacity(id: number, opacity: number): void;
  moveLayer(from: number, to: number): void;
  renameLayer(id: number, name: string): void;

  // Sync reads (cached; safe per frame)
  getStats(): EngineStats;
  getChronoEntries(): ChronoEntry[];
  getLayers(): LayerMeta[];
  getActiveLayer(): number;

  // Async I/O
  serialize(): Promise<ArrayBuffer>;
  raycast(origin, direction): Promise<RaycastResult | null>;

  // Lifecycle + subscriptions
  init(): Promise<void>;
  dispose(): void;
  on<T>(event: T, handler): () => void;

  // Contract pass-through
  getContract(): Contract | null;
  setContract(c: Contract | null): void;
}
```

Engine events: `'patch' | 'stats' | 'chrono' | 'layers' | 'ready' | 'error'`. All typed via a discriminated union; subscribers get type-narrowed payloads.

### The chunk model

`engine/chunks/Chunk.ts` — a 16³ chunk stored as `Uint16Array(4096)` (8 KB). Bit-packed cell format:

```
   bit:  15 ...  8   7 ...  0
        ┌──────────┬──────────┐
        │  layer   │  block   │
        └──────────┴──────────┘
              ↑          ↑
              8 bits     8 bits  (256 block types, 256 layers headroom)
```

Local index inside a chunk: `idx = (y_local << 8) | (z_local << 4) | x_local`. Each `Chunk` also keeps a `count` (non-air cells) maintained incrementally on every write, so the engine can skip empty chunks during enumeration without scanning their 4096 cells.

Chunks live in a sparse `Map<chunkKey, Chunk>` inside the worker. Empty chunks are not allocated. The V1 world (48 × 12 × 48 cells) maps to ≤16 chunks; the architecture scales to 256 × 64 × 256 (4096 chunks) without changes.

### The worker

`engine/worker/voxel.worker.ts` owns:

- `chunks: Map<chunkKey, Chunk>`
- `chronoLog: WorkerPatchEntry[]` — undo stack of delta records (not snapshots)
- `future: WorkerPatchEntry[]` — redo stack
- `layers: LayerMeta[]` and `activeLayer: number`
- `blockTable: BlockTableEntry[]` — stability / anomaly / opacity per BlockIndex
- Incremental counters: `cellCount`, `sumStability`, `sumAnomaly`

**Incremental stats are a major V1 win.** V1 walked the entire cells Map to compute integrity. V2 updates the running sums during `setCellAt(x,y,z,value)`, so `computeStats()` is O(1) regardless of world size. A 200 ms `STATS_TICK_MS` timer emits cached values.

**Inbound messages:** `INIT`, `APPLY_OPS`, `UNDO`, `REDO`, `JUMP_TO_CHRONO`, `CLEAR_ALL`, `SET_LAYER_*`, `MOVE_LAYER`, `RENAME_LAYER`, `SET_ACTIVE_LAYER`, `SET_CONTRACT`, `TICK_STATS`, `DISPOSE`. (Plus `SERIALIZE` and `LOADED_CHUNKS` stubs for Phase 5.)

**Outbound messages:** `READY`, `PATCH`, `STATS`, `CHRONO`, `LAYERS`, `SERIALIZED_RAW`, `ERROR`. `PATCH` payload is a `WireDelta[]` — one entry per changed cell — applied to the GPU on the next frame.

`INIT` always (re-)seeds the worker. Sending another `INIT` with new `seedCells` is the load-vault path; no fresh worker process needed.

### The RenderBridge

`engine/bridge/RenderBridge.ts` is the GPU patcher. Eliminates V1's `useEffect([cells, revision, layerRevision])` full-rebuild thrash. Key pieces:

- **Pre-allocated meshes.** 12 `InstancedMesh` at `MAX_INSTANCES=16384` each. Never grows mid-session.
- **`SlotAllocator`.** Per-mesh `Map<cellIdx, slot>` + `freeList: number[]`. `alloc()` pops the free list or increments `nextSlot`; `free()` pushes to the free list. Both O(1). `mesh.count = nextSlot` (high-water mark) — freed slots within range stay invisible via `ZERO_MATRIX`.
- **Frame-coalesced flushes.** `queueDeltas()` buffers worker output; `flushPending()` runs from `useFrame` and drains the buffer in one pass. Only meshes touched this frame call `instanceMatrix.needsUpdate = true`.
- **Per-layer re-bake.** Local `cellMeta: Map<cellIdx, CellRecord>` and `layerCells: Map<layerId, Set<cellIdx>>`. When `setLayers()` detects visibility/opacity/solo changes, only the affected layers' cells are re-baked. Cost: O(cells in changed layers), not O(all cells).
- **Hidden cells.** Layers with `visible=false` or excluded by solo collapse via `ZERO_MATRIX` (zero scale). No alpha state changes.
- **Transparent blocks.** `data-stream` has `transparent: true`, `depthWrite: false`, `renderOrder: 1` — drawn after opaque geometry to avoid z-fighting.
- **Materials and geometry are identical to V1.** Same `buildShaderMaterial` / `buildStandardMaterial` logic. Same `boundingSphere` override for world-bounds frustum culling. Same shared `uTime` uniform pattern (updated in `Voxels.tsx`'s `SharedShaderClock`).

### The wire format

| Surface | Type | Encoding |
|---|---|---|
| Public API (`CellOp`, `CellDelta`) | UI-facing | `BlockId` strings, numeric layer |
| Wire (`WireOp`, `WireDelta`) | Worker boundary | `BlockIndex` uint8, numeric layer |
| Chunk storage | Worker internal | uint16 per cell: `(layer << 8) \| blockIndex` |

`BLOCK_INDEX_TABLE` in `lib/blocks.ts` defines BlockId ↔ BlockIndex. **Append-only** — re-ordering invalidates every persisted OBS2 vault.

Large payloads (occupancy deltas for Phase 4 raycast worker, OBS2 buffers for Phase 5) cross worker boundaries as transferable `ArrayBuffer`. No `SharedArrayBuffer`, no COOP/COEP requirements.

### Key files

| File | Responsibility |
|---|---|
| `types/engine.ts` | `IVoxelEngine` API surface + `CellOp`, `CellDelta`, `EngineEvent`, `ChronoEntry`, … |
| `engine/bridge/WorkerProtocol.ts` | Discriminated unions for every worker message |
| `engine/bridge/RenderBridge.ts` | `SlotAllocator` + 12 InstancedMesh + frame-coalesced flush |
| `engine/chunks/Chunk.ts` | Uint16Array[4096] chunk + pack/unpack helpers |
| `engine/core/VoxelEngine.ts` | Main-thread singleton; spawns + seeds the worker; event emitter |
| `engine/worker/voxel.worker.ts` | Canonical state; APPLY_OPS / UNDO / REDO / etc. handlers |
| `hooks/useEngine.ts` | React access point — `useEngine()` and `getEngine()` |
| `lib/blocks.ts` | `BLOCK_TYPES`, `BLOCK_ORDER`, **append-only** `BLOCK_INDEX_TABLE` |

---

## Performance

V1 baseline (M1 Pro / Chrome):
- ~3000 voxels @ HIGH preset → ~62 fps
- ~6000 voxels @ BALANCED → >100 fps
- Brush stroke / undo hitch above ~800 voxels: 80–200 ms (V1 autopsy)

V2 targets (validated incrementally as phases land):
- ~5000 voxels @ HIGH → stable 60 fps, no hitches
- ~10000 voxels @ BALANCED → ≥120 fps on M1 Pro
- Brush stroke / undo: no long task > 16 ms in Chrome DevTools Performance

The architectural rationale: brush expansion + history update + integrity computation move to the worker; GPU writes coalesce into one pass per frame; React reconciliation is no longer triggered by voxel data changes (only by HUD metadata, at the 200 ms tick rate).

---

## V1 Reference (Historical)

V1 was a 1-hour Claude Code build. Its design choices that V2 **preserved**:

- **One `InstancedMesh` per BlockId** (12 total) — V2 keeps this geometry but moves slot management into `SlotAllocator`.
- **Per-cell opacity via `instanceColor` grayscale** — V2 keeps this trick (no alpha blending state changes); the bake re-runs from `RenderBridge.setLayers()`.
- **Shared `uTime` uniform** across all shader materials — V2 preserves the `SharedShaderClock` pattern.
- **Custom `boundingSphere`** on geometry for world-spanning frustum culling — V2 reuses the same trick.

What V2 **changed**:

- V1's `Voxels.tsx > InstancedGroup` ran `useEffect([cells, revision, layerRevision])` which walked the entire cells Map on every change and rebuilt every mesh's instance buffer. This was the main-thread thrash above ~800 voxels.
- V1's `voxelStore` (Zustand) owned the cells Map directly on the main thread. V2 moves canonical cells into the worker and demotes `voxelStore` to a shadow read cache.
- V1's brush operations (`brushCells` + `operationsForBrush`) ran fully on the main thread before the store update. V2 still expands brush on main thread for low-latency preview (`Cursor.tsx`), but the chunk write, chrono push, and stats update all happen in the worker.

| File | Role | V2 status |
|---|---|---|
| `stores/voxelStore.ts` | All voxel data, layers, history, contracts | Demoted to shadow read cache; retired after Phase 3.4 |
| `components/scene/Voxels.tsx` | Per-blockId InstancedMesh + full-rebuild useEffect | Rewritten as RenderBridge thin wrapper in Phase 3.3 |
| `components/scene/Interaction.tsx` | Pointer-to-cell + brush ops + `voxelStore.applyOps` call | Migrated to `engine.applyOps` in Phase 3.4 |
| `lib/blocks.ts` | Block definitions + stats | Extended with `BLOCK_INDEX_TABLE` for V2 wire format |
| `lib/brush.ts` | Brush shape + operation generation | Unchanged — V2 still uses for preview + pre-engine expansion |

---

*Last updated: 2026-05-10. Commit baseline: `2d42765`.*
