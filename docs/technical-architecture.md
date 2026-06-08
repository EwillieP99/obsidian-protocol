# Technical Architecture — Obsidian Protocol

This document provides a deep dive into the technical design of Obsidian Protocol. The V1 codebase was originally built in approximately 1 hour using **Claude Code Opus 4.7** in the terminal. V2 is a ground-up engine rebuild now largely complete — see the **V1 → V2 Status** section below.

---

## 0. V1 → V2 Status

> **Phase tracker — 2026-05-22 — Phases 0–5 complete; Wave A + Wave B shipped**
>
> | Phase | Commit | Status |
> |---|---|---|
> | 0–2: Engine scaffolding, worker stand-up, chunk model | `5f215f9` | ✅ Done |
> | 3.1: RenderBridge + worker re-INIT path | `2d42765` | ✅ Done |
> | 3.3: `Voxels.tsx` → RenderBridge thin wrapper | `2322016` | ✅ Done |
> | 3.4: All mutation sites → `IVoxelEngine` | `2322016` | ✅ Done |
> | 3.2: Worker as true mutation authority; retire storeUnsub | `2322016` | ✅ Done |
> | 3.5: Retire `voxelStore`; all UI reads through engine hooks | `8f7e9e8` | ✅ Done |
> | 4: Dedicated raycast worker + `engine.raycast()` | `8f7e9e8` | ✅ Done (UI still uses R3F raycasting for pointer input) |
> | 5: OBS2 binary persistence (compress worker) | `3f95ec0` | ✅ Done — engine codec + `lib/persistence.ts` binary I/O |
> | Wave A: Studio/Immersive, Artifact Library, toolbar groups | `3f95ec0` | ✅ Done |
> | Wave B: stamp polish, selection HUD, glTF, tests, 18 prefabs | `3f95ec0` | ✅ Done (B5 greedy meshing descoped) |

**Current state:** `voxelStore` is **deleted**. All canonical voxel state lives in `voxel.worker.ts`. `VoxelEngine` spawns three workers (`voxel`, `raycast`, `compress`) and keeps main-thread caches for sync reads. Six reactive hooks replace all former `useVoxelStore` selectors. **Studio mode** (default) hides Immersive HUD elements via `uiStore.immersiveMode`. **Artifact Library** (`lib/artifacts.ts`) provides prefab stamp + region clipboard + stamp transform (rotate/mirror). **16 block types** across 5 categories. CI runs typecheck, lint, Vitest (19 tests), and build on every push.

V2's full mandate:

1. **Tear the engine out of React.** All voxel state lives in `engine/worker/voxel.worker.ts`. React touches it only through `types/engine.ts:IVoxelEngine`.
2. **Frame-coalesce GPU writes.** `RenderBridge` accumulates per-cell deltas and applies them in a single `flushPending()` per frame, replacing V1's full-rebuild `useEffect`.
3. **Add chunking.** 16³ chunks with bit-packed `uint16` cells; sparse `Map<chunkKey, Chunk>` scales to 256×64×256 without changes.
4. **Binary persistence.** Saves use OBS2 (binary + RLE) via `compress.worker.ts`. Engine encode/decode and user-facing IndexedDB I/O are complete (Phase 5).

---

## 1. Tech Stack Overview

| Layer              | Technology                          | Purpose |
|--------------------|-------------------------------------|--------|
| Framework          | Next.js 14 (App Router)            | SSR, routing, modern React |
| 3D Rendering       | React Three Fiber (R3F) v8 + Three.js r170 | Real-time WebGL voxel engine |
| Post-processing    | @react-three/postprocessing        | Bloom, Glitch, Chromatic Aberration, etc. |
| State Management   | Zustand + subscribeWithSelector    | UI + effects only; voxel state lives in engine worker |
| Styling            | Tailwind CSS + Framer Motion       | Cyberpunk neon UI |
| Persistence        | idb-keyval (IndexedDB) + OBS2      | Autosave + named saves (binary OBS2 primary; JSON fallback on load) |
| Audio              | Web Audio API (synthesized)        | No asset dependency |
| Fonts              | Inter + Share Tech Mono            | Terminal + clean sans |
| Types              | TypeScript (strict)                | Full type safety |

**Key Constraint:** Pinned to Next.js 14 because R3F v8 is incompatible with Next 15's React internals.

---

## 2. High-Level Architecture

```
app/
├── layout.tsx          # Root layout + fonts + Toaster
├── page.tsx            # Entry point → <App />
└── globals.css         # Neon cyberpunk design system

components/
├── App.tsx             # Main orchestrator (HUD + Scene + Boot)
├── scene/              # All Three.js / R3F components
│   ├── Scene.tsx       # Canvas + lights + camera setup
│   ├── Voxels.tsx      # V2: RenderBridge thin wrapper (subscribes to
│   │                   #    engine 'patch'+'layers'; flushPending in useFrame)
│   ├── Interaction.tsx # Pointer events + brush logic → engine.applyOps()
│   ├── Cursor.tsx      # Live 3D brush preview (main-thread, unchanged)
│   ├── CameraRig.tsx   # Presets + focus + cinematic mode
│   ├── PostFX.tsx      # Reactive post-processing
│   ├── SceneEffects.tsx# Particles + shake + flash highlights
│   └── ...
├── ui/                 # All HUD panels
└── ...

engine/                 # V2 ENGINE — zero React imports. Black box.
├── bridge/
│   ├── WorkerProtocol.ts  # Typed message contracts for all 3 workers
│   └── RenderBridge.ts    # SlotAllocator + 16 pre-allocated InstancedMesh (one per block type)
├── chunks/
│   └── Chunk.ts        # Uint16Array[4096] chunk (8 KB), 16³, count cache
├── core/
│   └── VoxelEngine.ts  # Main-thread singleton; spawns 3 workers; event emitter;
│                       # local caches (localCells, layersCache, statsCache,
│                       # chronoCache, futureCache, contractCache) for sync reads.
├── persist/
│   └── obs2.ts         # OBS2 binary save format (encode/decode/RLE; Phase 5)
└── worker/
    ├── voxel.worker.ts # Canonical voxel state (chunks, chrono-log, layers,
    │                   # incremental stats counters, 200 ms STATS tick).
    │                   # Pushes OCCUPANCY_DELTA to raycast worker via MessageChannel.
    ├── raycast.worker.ts # Amanatides–Woo DDA grid; answers engine.raycast()
    └── compress.worker.ts # Stateless OBS2 encode/decode RPC (Phase 5)

stores/
├── uiStore.ts          # Brush, panels, camera, settings, FPS. Unchanged.
└── effectsStore.ts     # Particles, shake, bloom flash, focus. Unchanged.

lib/
├── blocks.ts           # 16 block definitions + BLOCK_INDEX_TABLE (V2 wire; append-only)
├── constants.ts        # World params + V2 chunk constants
├── brush.ts            # Brush shape logic (main-thread preview; unchanged)
├── persistence.ts      # IndexedDB save/load via engine.serialize() / loadSave() (OBS2 + JSON sniff)
├── contracts.ts        # Procedural contract generator — calls engine.applyOps()
├── audio.ts            # Web Audio SFX
└── utils.ts            # Helpers + V2 chunk helpers

types/
├── index.ts            # V1 shared TypeScript interfaces
└── engine.ts           # V2 public API surface (IVoxelEngine, CellOp,
                        # CellDelta, EngineEvent + clearBeforeApply, …)

hooks/
├── useEngine.ts        # useEngine() + getEngine() + reactive hooks:
│                       # useEngineStats, useEngineLayers, useEngineChrono,
│                       # useEngineContract, useLayerCounts
├── useKeyboardShortcuts.ts  # All undo/redo/etc via getEngine()
└── useEffectBindings.ts     # Particles/audio via engine 'patch' event subscription

shaders/                # Custom GLSL (6 block types with shaders)
```

---

## 3. Core Systems Explained

### 3.1 Voxel Engine (The Heart)

**Current state (V2, Phases 0–5 complete):**

- `Voxels.tsx` is a ~55-line RenderBridge thin wrapper:
  - Creates `RenderBridge` with a module-level `sharedUniforms` object
  - On mount: seeds bridge from `engine.getAllCells()` + `engine.getLayers()`
  - `engine.on('patch')` → `bridge.queueDeltas(deltas)` (with `clearBeforeApply` for load/clear ops)
  - `engine.on('layers')` → `bridge.setLayers(layers)` (triggers per-layer opacity rebake)
  - `useFrame` → `bridge.flushPending()` + `sharedUniforms.uTime.value` update
  - Renders `bridge.renderableMeshes` via `<primitive object={mesh} />`

- `RenderBridge` pre-allocates 16 `InstancedMesh` at `MAX_INSTANCES=16384` each (one per non-air `BLOCK_INDEX_TABLE` entry). A `SlotAllocator` maps `cellLinearIdx → instanceSlot` with O(1) alloc/free. GPU buffers never grow mid-session.

- All mutations (`applyOps`, `undo`, `redo`, `clearAll`, `loadSave`, layer ops) post directly to `voxel.worker.ts`. Worker `PATCH/STATS/CHRONO/LAYERS` replies drive the engine event bus. `VoxelEngine` keeps main-thread caches for sync reads (`getBlock`, `getStats`, `getLayers`, etc.).

- **Raycast worker (Phase 4):** `voxel.worker` pushes `OCCUPANCY_DELTA` pairs to `raycast.worker` over a dedicated `MessageChannel` after every mutation. `engine.raycast(origin, direction)` posts `RAY_QUERY` and returns a DDA hit. `Interaction.tsx` still uses R3F pointer raycasting for brush input — the worker API is for non-pointer queries (agents, gameplay).

- **OBS2 persistence (Phase 5, complete):** `engine.serialize(name?, thumbnail?)` routes chunk buffers through `compress.worker` into an OBS2 `ArrayBuffer`. `engine.loadSave()` sniffs OBS2 magic vs JSON. `lib/persistence.ts` writes binary to IndexedDB; legacy JSON saves still load and upgrade lazily on next write.

### 3.2 State Management (Zustand)

Two active stores:

- **uiStore** — Active block, brush state, panel visibility, camera preset, quality settings, FPS. Unchanged.
- **effectsStore** — Particles, screen shake, bloom flash, cell flash highlights, camera focus target. Unchanged.

All voxel data (cells, history, layers, stats, contract) lives in `voxel.worker.ts` and is accessed through engine hooks or sync cache reads. `voxelStore` was deleted in Phase 3.5.

### 3.3 Brush System

Located in `lib/brush.ts`:
- Supports 6 modes: `paint`, `erase`, `fill`, `replace`, `eyedropper`, `select`
- 2 shapes: `rectangle`, `circle` — flat stamps on the active layer (size scales area, not volume)
- Smart connect for power lines
- Operations expand on the main thread (for low-latency `Cursor.tsx` preview), then pass to `engine.applyOps()` as `CellOp[]`

### 3.4 History & Undo/Redo

- Full patch-based history (stores before/after state per cell) in `voxel.worker.ts` (canonical). Worker emits `CHRONO` with both `entries` (undo stack) and `futureEntries` (redo stack).
- Chrono-log timeline UI — click any entry calls `engine.jumpToChrono(id)`
- `useEngineChrono()` hook provides `{ entries, futureEntries }` reactively via the `'chrono'` engine event
- Visual flash feedback on affected cells (cyan for redo, magenta for undo) — detected in `useEffectBindings` by label prefix (`Undo: ` / `Redo: `)
- All history mutations route through `IVoxelEngine`: keyboard shortcuts, Toolbar buttons, HistoryPanel buttons all call `getEngine().undo/redo`

### 3.5 Performance Features

**V1 (historical):**
- Quality presets (HIGH / BALANCED / PERFORMANCE) — dynamically swap post-processing and drone count
- Auto-degrade — drops quality if FPS stays low
- Shared `uTime` uniform (single `useFrame` for all animated blocks)
- Frustum culling + instance capping, particle system capped at 360

**V2 adds:**
- **Frame-coalesced GPU writes (✅):** Multiple worker `PATCH` bursts between frames apply in a single `flushPending()` pass. `instanceMatrix.needsUpdate` fires at most once per dirty mesh per frame.
- **O(1) slot allocation (✅):** `SlotAllocator` uses `Map<cellIdx, slot>` + free-list LIFO. No per-frame scans.
- **Incremental stats counters (✅):** `cellCount / sumStability / sumAnomaly` update inside the worker on every cell write. `computeStats()` is O(1) regardless of world size. Stats tick at 200 ms.
- **Pre-allocated GPU buffers (✅):** 16 × `MAX_INSTANCES=16384` × 64 B ≈ 16 MB; no reallocation mid-session.
- **Web Worker offload (✅):** Brush chunk writes, undo/redo deltas, integrity computation all happen in `voxel.worker.ts` off the main thread. No long tasks from voxel mutations in Chrome DevTools Performance.
- **Zero-copy worker I/O (✅ partial):** Occupancy deltas, OBS2 chunk buffers, and serialized saves cross worker boundaries as transferable `ArrayBuffer`s; no COOP/COEP headers required. `LOADED_CHUNKS` zero-copy load path is reserved but not wired yet.

---

## 4. Rendering Pipeline

### Current flow (Phases 0–4 complete)

```
User interaction
  ↓
Interaction.tsx → getEngine().applyOps(CellOp[])
  ↓
VoxelEngine → postMessage APPLY_OPS to worker
  ↓
voxel.worker: chunk write, chrono push, incremental stats, delta build
  ↓ (parallel) OCCUPANCY_DELTA → raycast.worker blockIndex grid
  ↓ postMessage PATCH / STATS / CHRONO / LAYERS
VoxelEngine.handleWorkerMessage
  ├─ PATCH  → emit engine 'patch' + update localCells cache → bridge.queueDeltas()
  ├─ STATS  → statsCache update + emit engine 'stats' → useEngineStats re-renders
  ├─ CHRONO → chronoCache + futureCache update + emit engine 'chrono' → useEngineChrono re-renders
  └─ LAYERS → layersCache + activeLayerCache update + emit engine 'layers'
               → Voxels.tsx bridge.setLayers() rebakes changed layers
               → useEngineLayers re-renders

useFrame → bridge.flushPending() → GPU
  (only meshes touched this frame call instanceMatrix.needsUpdate)

engine 'patch' event
  └─ useEffectBindings → particles / audio / shake
     (undo/redo detected by label prefix; load ops skip via clearBeforeApply)
```

`PostFX.tsx`, `SceneEffects.tsx`, `Cursor.tsx`, and `Scene.tsx` are unchanged throughout all V2 phases.

---

## 5. Data Model

**BlockId** (16 types):
- Structure: `obsidian`, `chrome`, `carbon`, `corp-glass`
- Neon: `neon-cyan`, `neon-magenta`, `neon-amber`, `neon-lime`, `neon-violet`
- Energy: `toxic-core`, `power-line`
- Data: `data-stream`, `holo-billboard`, `circuit`, `neural-node`
- Anomaly: `glitch`

Each block has: `color`, `emissive`, `emissiveIntensity`, `stability`, `anomaly`, `shader` (optional), `transparent`, etc.

**Layers**: 12 vertical layers with visibility, lock, solo, opacity, order.

### V2 wire format

| Surface | Encoding |
|---|---|
| Public engine API (`CellOp`, `CellDelta`) | `BlockId` strings + numeric layer |
| Wire (`WireOp`, `WireDelta`) | `BlockIndex` uint8 + numeric layer |
| Stored in `Chunk.data` | uint16 per cell: `(layer << 8) \| blockIndex`. `0x0000` = air. |

`BLOCK_INDEX_TABLE` in `lib/blocks.ts` defines the BlockId ↔ BlockIndex mapping. **Append-only** — re-ordering invalidates every persisted OBS2 vault.

Chunk identity: key is `"cx,cy,cz"` (signed int16). Local index: `(y_local << 8) | (z_local << 4) | x_local`. Global cell identity for `SlotAllocator`: `cellLinearIdx(x,y,z) = (x + HALF) + (z + HALF) * WORLD_SIZE + y * WORLD_SIZE²`.

---

## 6. V1 Reference (Historical)

V1 was a 1-hour Claude Code build. Its design choices that V2 **preserved**:

- **One `InstancedMesh` per BlockId** (16 total) — V2 keeps this geometry but moves slot management into `SlotAllocator`.
- **Per-cell opacity via `instanceColor` grayscale** — V2 keeps this trick; rebake runs from `RenderBridge.setLayers()`.
- **Shared `uTime` uniform** across all shader materials — same module-level const in `Voxels.tsx`.
- **Custom `boundingSphere`** on geometry for world-spanning frustum culling — identical trick in `RenderBridge`.

What V2 **changed**:

- V1's `Voxels.tsx` ran `useEffect([cells, revision, layerRevision])` which walked the entire cells Map on every change. **Eliminated in Phase 3.3.**
- V1's `voxelStore` (Zustand) owned canonical cells. **Deleted in Phase 3.5.**
- V1's brush ops and undo/redo ran on the main thread via voxelStore. **API boundary moved to `IVoxelEngine` in Phase 3.4; compute runs off-thread in the worker.**

| File | Original V1 role | V2 status |
|---|---|---|
| `stores/voxelStore.ts` | Canonical voxel data + history | 🗑 Deleted (Phase 3.5) |
| `components/scene/Voxels.tsx` | Full-rebuild InstancedMesh per block type | ✅ RenderBridge thin wrapper (Phase 3.3) |
| `components/scene/Interaction.tsx` | Pointer events → `voxelStore.applyOps` | ✅ `engine.applyOps` + `engine.getBlock` (Phase 3.4 / 3.5) |
| `hooks/useKeyboardShortcuts.ts` | Undo/redo → voxelStore directly | ✅ `engine.undo/redo` + select/copy/paste (Phase 3.4 / Wave A) |
| `components/ui/Toolbar.tsx` | Undo/redo/clear → voxelStore | ✅ engine + collapsible groups + clipboard IO (Wave A) |
| `components/ui/HistoryPanel.tsx` | History display + undo/redo → voxelStore | ✅ `useEngineChrono()` (Phase 3.5) |
| `components/ui/LayerPanel.tsx` | Layer display + mutations → voxelStore | ✅ `useEngineLayers()` + `useLayerCounts()` + `useLayerDominantBlocks()` (Wave A) |
| `components/ui/StatusBar.tsx` | `cells.size` + `computeIntegrity()` from voxelStore | ✅ `useEngineStats()` (Phase 3.5) |
| `components/ui/IntegrityMeter.tsx` | `computeIntegrity()` from voxelStore | ✅ `useEngineStats()` + immersive gate (Wave A) |
| `components/ui/ContractPanel.tsx` | `contract` from voxelStore | ✅ `useEngineContract()` (Phase 3.5) |
| `hooks/useEffectBindings.ts` | voxelStore revision subscription → particles/audio | ✅ engine `'patch'` event subscription (Phase 3.5) |
| `lib/persistence.ts` | `buildSerialized` read from voxelStore | ✅ `engine.serialize()` / `loadSave()` — OBS2 binary I/O (Phase 5) |
| `lib/artifacts.ts` | — | ✅ Artifact Library + clipboard/stamp + transform (Wave A/B) |
| `lib/artifacts/transform.ts` | — | ✅ Stamp rotate/mirror (Wave B1) |
| `lib/exporters/gltf.ts` | — | ✅ glTF/GLB vault export (Wave B4) |
| `lib/selection.ts` | — | ✅ Selection AABB helpers (Wave B2) |
| `lib/settingsPresets.ts` | — | ✅ STUDIO/NEON/PERF/IMMERSIVE bundles (reskin) |
| `components/ui/ArtifactLibraryPanel.tsx` | — | ✅ Prefab/blueprint panel (Wave A) |
| `components/scene/SelectionBox.tsx` | — | ✅ 3D selection overlay (Wave B2) |
| `components/ui/SelectionHud.tsx` | — | ✅ Selection dimensions HUD (Wave B2) |
| `components/ui/CanvasHud.tsx` | — | ✅ Viewport HUD gizmo (Wave D partial) |
| `components/ui/FirstRunHints.tsx` | — | ✅ First-run Studio hints (Wave D partial) |
| `lib/contracts.ts` | `applyContract` clear via `store.cells` | ✅ `engine.getAllCells()` (Phase 3.5) |
| `lib/blocks.ts` | Block definitions + stats | Extended with `BLOCK_INDEX_TABLE` for V2 wire format |
| `lib/brush.ts` | Brush shape + operation generation | Unchanged — still used for preview + pre-engine op expansion |

---

## 7. Future-Proofing & Extensibility

- Adding a new block type: update `lib/blocks.ts` (`BLOCK_TYPES` + `BLOCK_ORDER` + **append** to `BLOCK_INDEX_TABLE`) + optional shader
- New UI panels follow the existing pattern in `components/ui/`; subscribe to engine events via the hooks in `hooks/useEngine.ts`
- The V2 engine sits behind `types/engine.ts:IVoxelEngine`; any consumer that uses the API is shielded from internal restructuring (chunk sizes, worker shape, persistence format)

---

*Last updated: 2026-05-22. Phases 0–5 complete; Wave A + Wave B (except greedy meshing) shipped in `3f95ec0`.*
