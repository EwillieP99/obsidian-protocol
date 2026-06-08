# Voxel Engine Deep Dive

The voxel engine is the technical heart of Obsidian Protocol. V2 is a from-scratch rebuild that moves all voxel state off the main thread. V1 is fully retired as of Phase 3.5.

> **Status — 2026-05-22**
>
> - ✅ **Phases 0–5** — worker engine, RenderBridge, voxelStore retired, raycast worker, OBS2 persistence
> - ✅ **Wave A** — Studio/Immersive, Artifact Library, toolbar groups, layer swatches
> - ✅ **Wave B** — stamp transform + ghost, selection box/HUD, 18 prefabs, glTF export, Vitest (19 tests)
> - ⏸ **B5 greedy meshing** — descoped; instanced rendering remains default
>
> See [V1 Autopsy](v1_autopsy.md) for the original problem statement.

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
│         ▼                                                │  │  future stack    │
│   InstancedMesh × 16 (pre-allocated MAX_INSTANCES)       │  │  layers          │
│                                                          │  │  stats counters  │
│   UI hooks ◄── 'stats'/'layers'/'chrono'/'contract' ◄────┼──│                  │
│   (useEngineStats, useEngineLayers, …)                   │  │                  │
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

  // Layer control ('layers' event fires on completion)
  setActiveLayer(id: number): void;
  setLayerVisibility(id: number, visible: boolean): void;
  setLayerLock(id: number, locked: boolean): void;
  setLayerSolo(id: number, solo: boolean): void;
  setLayerOpacity(id: number, opacity: number): void;
  moveLayer(from: number, to: number): void;
  renameLayer(id: number, name: string): void;

  // Sync reads (main-thread cache; safe per frame)
  getStats(): EngineStats;
  getChronoEntries(): ChronoEntry[];   // undo history
  getChronoFuture(): ChronoEntry[];    // redo stack
  getLayers(): LayerMeta[];
  getActiveLayer(): number;
  getBlock(x: number, y: number, z: number): BlockId | undefined;

  // Async I/O
  serialize(name?: string, thumbnail?: string): Promise<ArrayBuffer>;
  raycast(origin, direction): Promise<RaycastResult | null>;

  // Bulk read (initial bridge seed)
  getAllCells(): CellDelta[];

  // Lifecycle + subscriptions
  init(): Promise<void>;
  dispose(): void;
  on<T>(event: T, handler): () => void;

  // Contract
  getContract(): Contract | null;
  setContract(c: Contract | null): void;
}
```

Engine events: `'patch' | 'stats' | 'chrono' | 'layers' | 'contract' | 'ready' | 'error'`. All typed via a discriminated union; subscribers get type-narrowed payloads. The `'chrono'` event carries both `entries` (undo history) and `futureEntries` (redo stack). The `'layers'` event carries `activeLayer` alongside the layers array.

### React hooks

`hooks/useEngine.ts` exposes reactive hooks that subscribe to engine events and return state:

| Hook | Event | Returns |
|---|---|---|
| `useEngineStats()` | `'stats'` | `EngineStats` (cellCount, integrity, anomaly, …) |
| `useEngineLayers()` | `'layers'` | `{ layers: LayerMeta[], activeLayer: number }` |
| `useEngineChrono()` | `'chrono'` | `{ entries: ChronoEntry[], futureEntries: ChronoEntry[] }` |
| `useEngineContract()` | `'contract'` | `Contract \| null` |
| `useLayerCounts()` | `'patch'` | `Map<layerId, count>` (incremental) |
| `useLayerDominantBlocks()` | `'patch'` | Dominant block color per layer (Wave A) |

These hooks replace what was previously scattered across `useVoxelStore(...)` selectors in every UI component.

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

`engine/worker/voxel.worker.ts` owns all canonical voxel state:

- `chunks: Map<chunkKey, Chunk>`
- `chronoLog: WorkerPatchEntry[]` — undo stack of delta records (not snapshots)
- `future: WorkerPatchEntry[]` — redo stack
- `layers: LayerMeta[]` and `activeLayer: number`
- `blockTable: BlockTableEntry[]` — stability / anomaly / opacity per BlockIndex
- Incremental counters: `cellCount`, `sumStability`, `sumAnomaly`

**Incremental stats are a major V1 win.** V1 walked the entire cells Map to compute integrity. V2 updates the running sums during `setCellAt(x,y,z,value)`, so `computeStats()` is O(1) regardless of world size. A 200 ms `STATS_TICK_MS` timer emits cached values.

**Inbound messages:** `INIT`, `APPLY_OPS`, `UNDO`, `REDO`, `JUMP_TO_CHRONO`, `CLEAR_ALL`, `SET_LAYER_*`, `MOVE_LAYER`, `RENAME_LAYER`, `SET_ACTIVE_LAYER`, `SET_CONTRACT`, `TICK_STATS`, `DISPOSE`. (Plus `SERIALIZE` and `LOADED_CHUNKS` stubs for Phase 5.)

**Outbound messages:** `READY`, `PATCH`, `STATS`, `CHRONO`, `LAYERS`, `SERIALIZED_RAW`, `ERROR`. `PATCH` payload is a `WireDelta[]` — one entry per changed cell — applied to the GPU on the next frame. `CHRONO` carries both `entries` and `futureEntries`.

`INIT` always (re-)seeds the worker. Sending another `INIT` with new `seedCells` is the load-vault path; no fresh worker process needed.

### The RenderBridge

`engine/bridge/RenderBridge.ts` is the GPU patcher. Eliminates V1's `useEffect([cells, revision, layerRevision])` full-rebuild thrash. Key pieces:

- **Pre-allocated meshes.** 16 `InstancedMesh` at `MAX_INSTANCES=16384` each (one per non-air block type). Never grows mid-session.
- **`SlotAllocator`.** Per-mesh `Map<cellIdx, slot>` + `freeList: number[]`. `alloc()` pops the free list or increments `nextSlot`; `free()` pushes to the free list. Both O(1). `mesh.count = nextSlot` (high-water mark) — freed slots within range stay invisible via `ZERO_MATRIX`.
- **Frame-coalesced flushes.** `queueDeltas()` buffers worker output; `flushPending()` runs from `useFrame` and drains the buffer in one pass. Only meshes touched this frame call `instanceMatrix.needsUpdate = true`.
- **Per-layer re-bake.** Local `cellMeta: Map<cellIdx, CellRecord>` and `layerCells: Map<layerId, Set<cellIdx>>`. When `setLayers()` detects visibility/opacity/solo changes, only the affected layers' cells are re-baked. Cost: O(cells in changed layers), not O(all cells).
- **Hidden cells.** Layers with `visible=false` or excluded by solo collapse via `ZERO_MATRIX` (zero scale). No alpha state changes.
- **Transparent blocks.** `data-stream` has `transparent: true`, `depthWrite: false`, `renderOrder: 1` — drawn after opaque geometry to avoid z-fighting.

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
| `engine/bridge/RenderBridge.ts` | `SlotAllocator` + 16 InstancedMesh + frame-coalesced flush |
| `engine/chunks/Chunk.ts` | Uint16Array[4096] chunk + pack/unpack helpers |
| `engine/core/VoxelEngine.ts` | Main-thread singleton; spawns workers; opens voxel↔raycast `MessageChannel`; event emitter; main-thread caches (localCells, layersCache, statsCache, …) |
| `engine/worker/voxel.worker.ts` | Canonical state; APPLY_OPS / UNDO / REDO / etc. handlers; pushes `OCCUPANCY_DELTA` over the raycast port on every mutation |
| `engine/worker/compress.worker.ts` | OBS2 encode/decode RPC (`ENCODE` / `DECODE`) |
| `engine/persist/obs2.ts` | OBS2 binary codec (RLE chunk payloads, magic header) |
| `engine/worker/raycast.worker.ts` | `Uint8Array(worldX·worldY·worldZ)` blockIndex grid kept in sync via `OCCUPANCY_DELTA`; answers `RAY_QUERY` with Amanatides–Woo DDA |
| `hooks/useEngine.ts` | `useEngine()`, `getEngine()`, and reactive hooks: `useEngineStats`, `useEngineLayers`, `useEngineChrono`, `useEngineContract`, `useLayerCounts`, `useLayerDominantBlocks` |
| `lib/artifacts/transform.ts` | Stamp rotate/mirror transform for prefab placement (Wave B1) |
| `lib/exporters/gltf.ts` | Read-only glTF/GLB vault export (Wave B4) |
| `lib/selection.ts` | Selection AABB helpers for copy/paste UI (Wave B2) |
| `lib/blocks.ts` | `BLOCK_TYPES`, `BLOCK_ORDER`, **append-only** `BLOCK_INDEX_TABLE` (16 block types) |

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

- **One `InstancedMesh` per BlockId** (16 total) — V2 keeps this geometry but moves slot management into `SlotAllocator`.
- **Per-cell opacity via `instanceColor` grayscale** — V2 keeps this trick (no alpha blending state changes); the bake re-runs from `RenderBridge.setLayers()`.
- **Shared `uTime` uniform** across all shader materials — updated once per frame in `components/scene/Voxels.tsx` (module-level `sharedUniforms`).
- **Custom `boundingSphere`** on geometry for world-spanning frustum culling — V2 reuses the same trick.

What V2 **changed**:

- V1's `Voxels.tsx > InstancedGroup` ran `useEffect([cells, revision, layerRevision])` which walked the entire cells Map on every change and rebuilt every mesh's instance buffer. **Eliminated in Phase 3.3.**
- V1's `voxelStore` (Zustand) owned the cells Map directly on the main thread. **Deleted in Phase 3.5.** Canonical cells live in `voxel.worker.ts`; a `localCells: Map<string, BlockId>` in `VoxelEngine` mirrors them for sync reads.
- V1's brush operations (`brushCells` + `operationsForBrush`) ran fully on the main thread before the store update. V2 still expands brush on main thread for low-latency preview (`Cursor.tsx`), but the chunk write, chrono push, and stats update all happen in the worker.

| File | Role | V2 status |
|---|---|---|
| `stores/voxelStore.ts` | All voxel data, layers, history, contracts | 🗑 Deleted (Phase 3.5) |
| `components/scene/Voxels.tsx` | Per-blockId InstancedMesh + full-rebuild useEffect | ✅ RenderBridge thin wrapper (Phase 3.3) |
| `components/scene/Interaction.tsx` | Pointer-to-cell + brush ops + `voxelStore.applyOps` | ✅ `engine.applyOps` + `engine.getBlock` (Phase 3.4 / 3.5) |
| `hooks/useKeyboardShortcuts.ts` | Undo/redo → voxelStore | ✅ `engine.undo/redo` (Phase 3.4) |
| `components/ui/Toolbar.tsx` | Undo/redo/clear → voxelStore | ✅ engine (Phase 3.4 / 3.5) |
| `components/ui/HistoryPanel.tsx` | History display from voxelStore | ✅ `useEngineChrono()` (Phase 3.5) |
| `components/ui/LayerPanel.tsx` | Layer display + mutations → voxelStore | ✅ `useEngineLayers()` + `useLayerCounts()` + engine mutations (Phase 3.5) |
| `components/ui/StatusBar.tsx` | `cells.size` + `computeIntegrity()` from voxelStore | ✅ `useEngineStats()` (Phase 3.5) |
| `components/ui/IntegrityMeter.tsx` | `computeIntegrity()` from voxelStore | ✅ `useEngineStats()` (Phase 3.5) |
| `components/ui/ContractPanel.tsx` | `contract` from voxelStore | ✅ `useEngineContract()` (Phase 3.5) |
| `hooks/useEffectBindings.ts` | voxelStore revision subscription → particles/audio | ✅ engine `'patch'` event subscription (Phase 3.5) |
| `lib/persistence.ts` | `buildSerialized` read from voxelStore | ✅ reads from engine (Phase 3.5) |
| `lib/contracts.ts` | `applyContract` clear via `store.cells` | ✅ `engine.getAllCells()` (Phase 3.5) |
| `lib/blocks.ts` | Block definitions + stats | Extended with `BLOCK_INDEX_TABLE` for V2 wire format |
| `lib/brush.ts` | Brush shape + operation generation | Unchanged — still used for preview + pre-engine op expansion |

---

*Last updated: 2026-05-22. Phases 0–5 + Wave A/B complete (B5 greedy meshing descoped).*
