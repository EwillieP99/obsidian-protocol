# Technical Architecture — Obsidian Protocol

This document provides a deep dive into the technical design of Obsidian Protocol. The V1 codebase was originally built in approximately 1 hour using **Claude Code Opus 4.7** in the terminal. V2 is a ground-up engine rebuild now in active progress — see the **V1 → V2 Status** section below.

---

## 0. V1 → V2 Status

> **Phase tracker — 2026-05-13 — commit `2322016`**
>
> | Phase | Commit | Status |
> |---|---|---|
> | 0–2: Engine scaffolding, worker stand-up, chunk model | `5f215f9` | ✅ Done |
> | 3.1: RenderBridge + worker re-INIT path | `2d42765` | ✅ Done |
> | 3.3: `Voxels.tsx` → RenderBridge thin wrapper | `2322016` | ✅ Done |
> | 3.4: All mutation sites → `IVoxelEngine` | `2322016` | ✅ Done |
> | 3.2: Worker as true mutation authority (retire storeUnsub) | — | ⏳ Next |
> | 3.5: Retire `voxelStore` once all UI reads through engine | — | ⏳ Pending 3.2 |
> | 4: Dedicated raycast worker | — | 🔜 Roadmap |
> | 5: OBS2 binary persistence (compress worker) | — | 🔜 Roadmap |

**Current state (as of `2322016`):** `Voxels.tsx` is the RenderBridge thin wrapper — no more `useEffect([revision])` full-rebuilds. Every mutation (place, erase, undo, redo, contract load, save load, clear) now routes through `IVoxelEngine`. `voxelStore` has been demoted to a **shadow read cache**: the engine proxy methods still write into it so that `HistoryPanel`, `StatusBar`, `IntegrityMeter`, `LayerPanel`, and `useEffectBindings` continue reading from it without needing to be migrated yet.

**Phase 3.2 (next):** Flip `VoxelEngine.applyOps/undo/redo/…` to post directly to the worker instead of calling voxelStore. The worker's `PATCH/STATS/CHRONO/LAYERS` replies drive the engine event bus; the engine shadow-writes voxelStore from those replies. Once complete, the `storeUnsub` can be removed and voxelStore is purely a read cache.

V2's full mandate:

1. **Tear the engine out of React.** All voxel state lives in `engine/worker/voxel.worker.ts`. React touches it only through `types/engine.ts:IVoxelEngine`.
2. **Frame-coalesce GPU writes.** `RenderBridge` accumulates per-cell deltas and applies them in a single `flushPending()` per frame, replacing V1's full-rebuild `useEffect`.
3. **Add chunking.** 16³ chunks with bit-packed `uint16` cells; sparse `Map<chunkKey, Chunk>` scales to 256×64×256 without changes.
4. **Binary persistence.** Saves move from V1 JSON to OBS2 (binary + RLE) via a compress worker. ~140× smaller for typical builds. (Phase 5.)

---

## 1. Tech Stack Overview

| Layer              | Technology                          | Purpose |
|--------------------|-------------------------------------|--------|
| Framework          | Next.js 14 (App Router)            | SSR, routing, modern React |
| 3D Rendering       | React Three Fiber (R3F) v8 + Three.js r170 | Real-time WebGL voxel engine |
| Post-processing    | @react-three/postprocessing        | Bloom, Glitch, Chromatic Aberration, etc. |
| State Management   | Zustand + subscribeWithSelector    | Global reactive state (UI + effects; voxels shadow-only) |
| Styling            | Tailwind CSS + Framer Motion       | Cyberpunk neon UI |
| Persistence        | idb-keyval (IndexedDB)             | Autosave + named saves |
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
│   ├── Voxels.tsx      # ✅ V2: RenderBridge thin wrapper (subscribes to
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
│   └── RenderBridge.ts    # SlotAllocator + 12 pre-allocated InstancedMesh
├── chunks/
│   └── Chunk.ts        # Uint16Array[4096] chunk (8 KB), 16³, count cache
├── core/
│   └── VoxelEngine.ts  # Main-thread singleton; spawns worker; event emitter;
│                       # proxy methods still shadow-write voxelStore (Phase 3.2
│                       # will flip to worker-canonical)
└── worker/
    └── voxel.worker.ts # Canonical voxel state (chunks, chrono-log, layers,
                        # incremental stats counters, 200 ms STATS tick).
                        # Future: raycast.worker.ts (Phase 4),
                        # compress.worker.ts (Phase 5).

stores/
├── voxelStore.ts       # ⚠ Shadow read cache only (as of Phase 3.4). Written
│                       #   by VoxelEngine proxy methods; read by HUD panels +
│                       #   useEffectBindings. Retired after Phase 3.5.
├── uiStore.ts          # Brush, panels, camera, settings, FPS. Unchanged.
└── effectsStore.ts     # Particles, shake, bloom flash, focus. Unchanged.

lib/
├── blocks.ts           # 12 block definitions + BLOCK_INDEX_TABLE (V2 wire)
├── constants.ts        # World params + V2 chunk constants
├── brush.ts            # Brush shape logic (main-thread preview; unchanged)
├── persistence.ts      # IndexedDB save/load — calls engine.loadSave()
├── contracts.ts        # Procedural contract generator — calls engine.applyOps()
├── audio.ts            # Web Audio SFX
└── utils.ts            # Helpers + V2 chunk helpers

types/
├── index.ts            # V1 shared TypeScript interfaces
└── engine.ts           # V2 public API surface (IVoxelEngine, CellOp,
                        # CellDelta, EngineEvent + clearBeforeApply, …)

hooks/
├── useEngine.ts        # React access point — useEngine() + getEngine()
├── useKeyboardShortcuts.ts  # All undo/redo/etc via getEngine()
└── useEffectBindings.ts     # Particles/audio via voxelStore subscription
                             # (still works because shadow writes keep it live)

shaders/                # Custom GLSL (6 block types with shaders)
```

---

## 3. Core Systems Explained

### 3.1 Voxel Engine (The Heart)

**Current state (V2, Phase 3.3+3.4 complete):**

- `Voxels.tsx` is a ~55-line RenderBridge thin wrapper:
  - Creates `RenderBridge` with a module-level `sharedUniforms` object
  - On mount: seeds bridge from `engine.getAllCells()` + `engine.getLayers()`
  - `engine.on('patch')` → `bridge.queueDeltas(deltas)` (with `clearBeforeApply` for load/clear ops)
  - `engine.on('layers')` → `bridge.setLayers(layers)` (triggers per-layer opacity rebake)
  - `useFrame` → `bridge.flushPending()` + `sharedUniforms.uTime.value` update
  - Renders `bridge.renderableMeshes` via `<primitive object={mesh} />`

- `RenderBridge` pre-allocates 12 `InstancedMesh` at `MAX_INSTANCES=16384` each. A `SlotAllocator` maps `cellLinearIdx → instanceSlot` with O(1) alloc/free. GPU buffers never grow mid-session.

- **Phase 3.2 remaining work:** `VoxelEngine.applyOps/undo/redo/clearAll/loadSave` currently proxy to voxelStore and emit engine events from there. Phase 3.2 flips this so ops post to the worker directly; worker's `PATCH/STATS/CHRONO/LAYERS` replies become the source of engine events, and voxelStore gets shadow-written from those replies.

### 3.2 State Management (Zustand)

Three independent stores:

- **voxelStore** — **Shadow read cache (as of Phase 3.4).** Written by VoxelEngine proxy methods. Read by: `HistoryPanel` (history/future arrays), `LayerPanel` (layer mutations + block counts), `StatusBar`/`IntegrityMeter` (cell count + integrity), `useEffectBindings` (particles/audio). Will be retired in Phase 3.5 once all readers migrate to engine reads.
- **uiStore** — Active block, brush state, panel visibility, camera preset, quality settings, FPS. Unchanged.
- **effectsStore** — Particles, screen shake, bloom flash, cell flash highlights, camera focus target. Unchanged.

### 3.3 Brush System

Located in `lib/brush.ts`:
- Supports 5 modes: `paint`, `erase`, `fill`, `replace`, `eyedropper`
- 3 shapes: `cube`, `sphere`, `plane`
- Smart connect for power lines
- Operations expand on the main thread (for low-latency `Cursor.tsx` preview), then pass to `engine.applyOps()` as `CellOp[]`

### 3.4 History & Undo/Redo

- Full patch-based history (stores before/after state per cell) in both `voxelStore` (shadow) and `voxel.worker.ts` (canonical)
- Chrono-log timeline UI — click any entry calls `engine.jumpToChrono(id)` which walks back via repeated `engine.undo()`
- Visual flash feedback on affected cells (cyan for redo, magenta for undo)
- All history mutations route through `IVoxelEngine`: keyboard shortcuts, Toolbar buttons, HistoryPanel buttons all call `getEngine().undo/redo`

### 3.5 Performance Features

**V1 (historical):**
- Quality presets (HIGH / BALANCED / PERFORMANCE) — dynamically swap post-processing and drone count
- Auto-degrade — drops quality if FPS stays low
- Shared `uTime` uniform (single `useFrame` for all animated blocks)
- Frustum culling + instance capping, particle system capped at 360

**V2 adds (current + planned):**
- **Frame-coalesced GPU writes (✅):** Multiple worker `PATCH` bursts between frames apply in a single `flushPending()` pass. `instanceMatrix.needsUpdate` fires at most once per dirty mesh per frame.
- **O(1) slot allocation (✅):** `SlotAllocator` uses `Map<cellIdx, slot>` + free-list LIFO. No per-frame scans.
- **Incremental stats counters (✅):** `cellCount / sumStability / sumAnomaly` update inside the worker on every cell write. `computeStats()` is O(1) regardless of world size.
- **Pre-allocated GPU buffers (✅):** 12 × `MAX_INSTANCES=16384` × 64 B = ~12 MB; no reallocation mid-session.
- **Web Worker offload (⏳ Phase 3.2):** Brush results, undo/redo deltas, integrity computation — currently on main thread via voxelStore proxy; moves fully off-thread when worker becomes the mutation authority.
- **Zero-copy worker I/O (🔜):** Large payloads via transferable `ArrayBuffer`; no COOP/COEP headers required.

---

## 4. Rendering Pipeline

### Current flow (Phase 3.3+3.4 complete)

```
User interaction
  ↓
Interaction.tsx → getEngine().applyOps(CellOp[])
  ↓
VoxelEngine.applyOps
  ├─ voxelStore.applyOps()  ← shadow write (keeps HUD panels + useEffectBindings live)
  ├─ emits engine 'patch' event with CellDelta[]
  └─ posts APPLY_OPS to worker  ← worker mirrors state (Phase 2 holdover)

engine 'patch' event
  ↓
Voxels.tsx  engine.on('patch') → bridge.queueDeltas(deltas)
  ↓
useFrame → bridge.flushPending()
  ↓
InstancedMesh GPU buffers updated  ← single pass, only dirty meshes

voxelStore revision bump (from shadow write)
  ↓
useEffectBindings subscription fires → particles / audio / shake
HistoryPanel / StatusBar / IntegrityMeter / LayerPanel re-render
```

Layer changes (from LayerPanel) follow the same pattern: voxelStore layer methods bump `layerRevision` → `storeUnsub` in VoxelEngine emits `'layers'` → Voxels.tsx bridge.setLayers() rebakes affected layers.

### Target flow (Phase 3.2, worker-canonical)

```
User interaction
  ↓
Interaction.tsx → getEngine().applyOps(CellOp[])
  ↓
VoxelEngine → postMessage APPLY_OPS to worker
  ↓
voxel.worker: chunk write, chrono push, incremental stats, delta build
  ↓ postMessage PATCH / STATS / CHRONO / LAYERS
VoxelEngine.handleWorkerMessage
  ├─ PATCH  → bridge.queueDeltas() + shadow-write voxelStore.cells
  ├─ STATS  → statsCache + emit engine 'stats'
  ├─ CHRONO → emit engine 'chrono' + shadow-write voxelStore.history
  └─ LAYERS → emit engine 'layers' + shadow-write voxelStore.layers

useFrame → bridge.flushPending() → GPU
useEffectBindings / HUD reads via voxelStore shadow
```

`PostFX.tsx`, `SceneEffects.tsx`, `Cursor.tsx`, and `Scene.tsx` are unchanged in both flows.

---

## 5. Data Model

**BlockId** (12 types):
- Structure: `obsidian`, `chrome`, `corp-glass`
- Neon: `neon-cyan`, `neon-magenta`
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

- **One `InstancedMesh` per BlockId** (12 total) — V2 keeps this geometry but moves slot management into `SlotAllocator`.
- **Per-cell opacity via `instanceColor` grayscale** — V2 keeps this trick; rebake runs from `RenderBridge.setLayers()`.
- **Shared `uTime` uniform** across all shader materials — same module-level const in `Voxels.tsx`.
- **Custom `boundingSphere`** on geometry for world-spanning frustum culling — identical trick in `RenderBridge`.

What V2 **changed**:

- V1's `Voxels.tsx` ran `useEffect([cells, revision, layerRevision])` which walked the entire cells Map on every change. **Eliminated in Phase 3.3.**
- V1's `voxelStore` (Zustand) owned canonical cells. **Demoted to shadow cache in Phase 3.4.**
- V1's brush ops and undo/redo ran on the main thread via voxelStore. **API boundary moved to `IVoxelEngine` in Phase 3.4; compute moves off-thread in Phase 3.2.**

| File | Original V1 role | V2 status |
|---|---|---|
| `stores/voxelStore.ts` | Canonical voxel data + history | ⚠ Shadow read cache — retired in Phase 3.5 |
| `components/scene/Voxels.tsx` | Full-rebuild InstancedMesh per block type | ✅ RenderBridge thin wrapper (Phase 3.3) |
| `components/scene/Interaction.tsx` | Pointer events → `voxelStore.applyOps` | ✅ → `engine.applyOps` (Phase 3.4) |
| `hooks/useKeyboardShortcuts.ts` | Undo/redo → voxelStore directly | ✅ → `engine.undo/redo` (Phase 3.4) |
| `components/ui/Toolbar.tsx` | Undo/redo/clear → voxelStore | ✅ → engine (Phase 3.4) |
| `components/ui/HistoryPanel.tsx` | History display + undo/redo → voxelStore | ✅ → engine (Phase 3.4) |
| `lib/persistence.ts` | loadSave → voxelStore directly | ✅ → `engine.loadSave()` (Phase 3.4) |
| `lib/contracts.ts` | applyContract → `store.applyOps` | ✅ → `engine.applyOps` (Phase 3.4) |
| `lib/blocks.ts` | Block definitions + stats | Extended with `BLOCK_INDEX_TABLE` for V2 wire |
| `lib/brush.ts` | Brush shape + operation generation | Unchanged — still used for preview + pre-engine expansion |

---

## 7. Future-Proofing & Extensibility

- Adding a new block type: update `lib/blocks.ts` (`BLOCK_TYPES` + `BLOCK_ORDER` + **append** to `BLOCK_INDEX_TABLE`) + optional shader
- New UI panels follow the existing pattern in `components/ui/`
- The V2 engine sits behind `types/engine.ts:IVoxelEngine`; any consumer that uses the API is shielded from internal restructuring (chunk sizes, worker shape, persistence format)
- `useEffectBindings` and the layer/history HUD panels can migrate to engine event subscriptions independently of each other, whenever we're ready to retire voxelStore

---

*Last updated: 2026-05-13. Commit baseline: `2322016`.*
