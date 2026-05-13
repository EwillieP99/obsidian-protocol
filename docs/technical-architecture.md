# Technical Architecture — Obsidian Protocol

This document provides a deep dive into the technical design of Obsidian Protocol. The V1 codebase was originally built in approximately 1 hour using **Claude Code Opus 4.7** in the terminal. V2 is a ground-up engine rebuild now in active progress — see the **V1 → V2 Status** section below.

---

## 0. V1 → V2 Status

> **Phase tracker:** V2 scaffolding at `5f215f9`; RenderBridge + worker re-INIT at `2d42765`; Phases 3.3+3.4 at `2322016`. Voxels.tsx is now the RenderBridge thin wrapper; all mutations route through `IVoxelEngine`. Phase 3.2 (worker as true mutation authority) is next. See [V1 Autopsy](v1_autopsy.md) for the original problem statement.

V1 (commits up to `1775675`) is feature-complete but main-thread-bound — every brush stroke, undo, layer toggle, or contract load hitches 80–200 ms above ~800 voxels. The root cause: all voxel data lives in `voxelStore` (a Zustand store) on the main thread, so every mutation triggers React reconciliation, Framer Motion animation loops, and shader uniform updates simultaneously.

V2's mandate:

1. **Tear the engine out of React.** All voxel state lives in a dedicated Web Worker (`engine/worker/voxel.worker.ts`). React touches it only through a typed API surface (`types/engine.ts:IVoxelEngine`).
2. **Frame-coalesce GPU writes.** A `RenderBridge` accumulates per-cell deltas between frames and applies them in a single pass per frame, replacing V1's `useEffect([cells, revision, layerRevision])` full-rebuild.
3. **Add chunking.** The world is divided into 16³ chunks (`engine/chunks/Chunk.ts`) with bit-packed `uint16` cells (high byte = layer, low byte = block index). Sparse `Map<chunkKey, Chunk>` storage scales to a 256×64×256 world without architectural changes.
4. **Binary persistence.** Saves move from V1 JSON to OBS2 (binary + RLE) via a dedicated compress worker. ~140× smaller for typical builds. (Phase 5.)

V1 is preserved verbatim and still drives the visible UI today. V2 lives alongside it; phases 3.2–3.4 progressively migrate UI consumers to the engine API, after which V1's `voxelStore` is retired.

---

## 1. Tech Stack Overview

| Layer              | Technology                          | Purpose |
|--------------------|-------------------------------------|--------|
| Framework          | Next.js 14 (App Router)            | SSR, routing, modern React |
| 3D Rendering       | React Three Fiber (R3F) v8 + Three.js r170 | Real-time WebGL voxel engine |
| Post-processing    | @react-three/postprocessing        | Bloom, Glitch, Chromatic Aberration, etc. |
| State Management   | Zustand + subscribeWithSelector    | Global reactive state (voxels, UI, effects) |
| Styling            | Tailwind CSS + Framer Motion       | Cyberpunk neon UI |
| Persistence        | idb-keyval (IndexedDB)             | Autosave + named saves |
| Audio              | Web Audio API (synthesized)        | No asset dependency |
| Fonts              | Inter + Share Tech Mono            | Terminal + clean sans |
| Types              | TypeScript (strict)                | Full type safety |

**Key Constraint:** Pinned to Next.js 14 because R3F v8 is incompatible with Next 15’s React internals.

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
│   ├── Voxels.tsx      # V1: InstancedMesh per blockId (full-rebuild on revision++)
│   │                   # V2 (Phase 3.3): thin wrapper around RenderBridge
│   ├── Interaction.tsx # Pointer events + brush logic
│   ├── Cursor.tsx      # Live 3D brush preview
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
│   └── VoxelEngine.ts  # Main-thread singleton; spawns + owns the workers
└── worker/
    └── voxel.worker.ts # Canonical voxel state (chunks, chrono-log, layers,
                        # incremental stats counters, 200 ms STATS tick).
                        # Future: raycast.worker.ts (Phase 4),
                        # compress.worker.ts (Phase 5).

stores/
├── voxelStore.ts       # V1 store (cells, layers, history, contracts).
│                       # V2 (post Phase 3.4): shadow read cache; retired
│                       # once every UI consumer migrates to engine.*
├── uiStore.ts          # Brush, panels, camera, settings, FPS
└── effectsStore.ts     # Particles, shake, bloom flash, focus target

lib/
├── blocks.ts           # 12 block definitions + lore + stats; V2 adds
│                       # BLOCK_INDEX_TABLE (append-only wire ordering)
├── constants.ts        # World params + V2 chunk constants (CHUNK_SIZE,
│                       # MAX_INSTANCES, STATS_TICK_MS, …)
├── brush.ts            # Brush shape logic (V1 + V2 — main-thread preview)
├── persistence.ts      # IndexedDB save/load + autosave (V1 JSON today;
│                       # OBS2 binary in Phase 5)
├── contracts.ts        # Procedural Corporate Contract generator
├── audio.ts            # Web Audio SFX
└── utils.ts            # Helpers + V2 chunk helpers (chunkKey, localIdx,
                        # cellLinearIdx, chunkCoord, inWorld)

types/
├── index.ts            # V1 shared TypeScript interfaces
└── engine.ts           # V2 public API surface (IVoxelEngine, CellOp,
                        # CellDelta, EngineEvent, ChronoEntry, …)

hooks/
├── useEngine.ts        # V2 React access point to VoxelEngine singleton
├── useKeyboardShortcuts.ts
└── useEffectBindings.ts

shaders/                # Custom GLSL (6 block types with shaders)
```

---

## 3. Core Systems Explained

### 3.1 Voxel Engine (The Heart)

**V1 (today's visible UI):**

- Uses **one `InstancedMesh` per block type** (12 total)
- Shared `uTime` uniform across all shader materials (very efficient)
- Per-layer opacity handled via `instanceColor` modulation (no alpha blending state changes)
- Custom bounding sphere on geometry for proper frustum culling across the entire world
- Dynamic capacity growth when placing large numbers of voxels
- Revision-based reactivity (store `revision` increments → re-render all instances). **This is the V1 thrash site** — see autopsy.

**V2 (shipped at `2d42765`, partial wire-up):**

- Worker-canonical state: `engine/worker/voxel.worker.ts` owns the cells, chrono-log, layers, and incremental stats counters off the main thread.
- 16³ chunks with bit-packed `uint16` cells (`engine/chunks/Chunk.ts`). Sparse `Map<chunkKey, Chunk>`. Air cells = 0; non-zero = `(layer << 8) | blockIndex`.
- `RenderBridge` (`engine/bridge/RenderBridge.ts`) pre-allocates 12 `InstancedMesh` at `MAX_INSTANCES=16384` each. A `SlotAllocator` maps `cellLinearIdx -> instanceSlot` with O(1) alloc/free.
- Frame-coalesced GPU writes: worker `PATCH` deltas accumulate in a ring buffer and apply once per frame in `useFrame`. `instanceMatrix.needsUpdate` fires at most once per dirty mesh per frame.
- Incremental stats: integrity / anomaly / cellCount are kept current on every cell write inside the worker. `engine.getStats()` is O(1).
- Same shader system. Same `uTime` shared uniform pattern. Same world-bounding-sphere frustum-cull trick.

### 3.2 State Management (Zustand)

Three independent stores with clear responsibilities:

- **voxelStore**: Cells (Map), Layers (12), History (undo/redo), Contracts, Integrity calculation.
  - **V2 evolution:** voxelStore is being demoted to a shadow read cache. After Phase 3.4, the worker owns canonical cells / layers / chrono-log, and the engine `setState`s back into voxelStore on each `PATCH/CHRONO/LAYERS` so unmigrated read UI keeps working. Once every UI consumer reads through the engine, voxelStore is deleted.
- **uiStore**: Active block, brush state, panel visibility, camera preset, quality settings, FPS. **Unchanged in V2.**
- **effectsStore**: Particles, screen shake, bloom flash, cell flash highlights, camera focus target. **Unchanged in V2.**

This separation keeps concerns clean and allows fine-grained subscriptions.

### 3.3 Brush System

Located in `lib/brush.ts`:
- Supports 5 modes: `paint`, `erase`, `fill`, `replace`, `eyedropper`
- 3 shapes: `cube`, `sphere`, `plane`
- Smart connect for power lines
- Operations are batched into history entries

### 3.4 History & Undo/Redo

- Full patch-based history (stores before/after state per cell)
- Chrono-log timeline UI (click to jump)
- Visual flash feedback on affected cells (cyan for redo, magenta for undo)
- Limited to last 100 actions

### 3.5 Performance Features

**V1:**

- Quality presets (HIGH / BALANCED / PERFORMANCE) that dynamically change post-processing and drone count
- Auto-degrade system (drops quality if FPS stays low)
- Shared shader uniforms (single `useFrame` for all animated blocks)
- Frustum culling + instance capping
- Particle system capped at 360

**V2 adds:**

- **Web Worker offload.** Brush results, undo/redo deltas, integrity / anomaly / cellCount, layer mutations — all computed off the main thread.
- **Frame-coalesced GPU writes.** Multiple worker `PATCH` bursts between frames apply in a single `flushPending()` pass. `instanceMatrix.needsUpdate` fires at most once per dirty mesh per frame.
- **O(1) slot allocation.** `SlotAllocator` uses a `Map<cellIdx, slot>` + free-list LIFO. No per-frame scans, no array compaction.
- **Incremental stats counters.** `cellCount / sumStability / sumAnomaly` update on every cell write inside the worker. The 200 ms `STATS` tick emits cached values — no world-walk.
- **Pre-allocated GPU buffers.** 12 × `MAX_INSTANCES=16384` × 64 B mat4 = ~12 MB; no mid-session reallocation.
- **Zero-copy worker I/O.** Large payloads (occupancy deltas, OBS2 buffers) move via transferable `ArrayBuffer`, not `SharedArrayBuffer` — no COOP/COEP headers needed.

---

## 4. Rendering Pipeline

**V1:**

1. `Scene.tsx` → Sets up Canvas, lights, fog, CameraRig
2. `Interaction.tsx` → Catches all pointer events; calls `voxelStore.applyOps`
3. `Voxels.tsx` → Subscribes to `cells / revision / layerRevision`; rebuilds every InstancedMesh on every change
4. `PostFX.tsx` → EffectComposer with reactive Bloom + Glitch
5. `SceneEffects.tsx` → Particles + Camera Shake + Cell Flash (Instanced)
6. `Cursor.tsx` → Live brush preview (ghosts + envelope)

**V2 mutation path** (post-Phase-3.4):

```
Interaction.tsx → engine.applyOps(CellOp[])
   ↓ postMessage
voxel.worker (chunk write, chrono push, stats update, delta build)
   ↓ postMessage
VoxelEngine.handleWorkerMessage
   ├──► RenderBridge.queueDeltas() ─── useFrame ──► flushPending() ──► GPU
   ├──► shadow-write voxelStore.cells (back-compat for unmigrated read UI)
   └──► emit 'patch'/'stats'/'chrono'/'layers' on the engine event bus
        ↓
   useEffectBindings (particles / audio / shake), HUD subscribers
```

`PostFX.tsx`, `SceneEffects.tsx`, `Cursor.tsx`, and `Scene.tsx` are unchanged.

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

The worker and main thread share a compact representation:

| Surface | Encoding |
|---|---|
| Public engine API (`CellOp`, `CellDelta`) | `BlockId` strings + numeric layer |
| Wire (`WireOp`, `WireDelta`) | `BlockIndex` uint8 + numeric layer |
| Stored in `Chunk.data` | uint16 per cell: `(layer << 8) \| blockIndex`. `0x0000` = air. |

`BLOCK_INDEX_TABLE` in `lib/blocks.ts` defines the BlockId ↔ BlockIndex mapping. It is **append-only** — re-ordering would invalidate every persisted OBS2 vault.

Chunk identity: a 16³ chunk's key is `"cx,cy,cz"` (signed int16). Local index inside a chunk: `(y_local << 8) | (z_local << 4) | x_local`. Global cell identity for `SlotAllocator` is `cellLinearIdx(x,y,z) = (x + HALF) + (z + HALF) * WORLD_SIZE + y * WORLD_SIZE²`.

---

## 6. Future-Proofing & Extensibility

The architecture was designed to be easy to extend:
- Adding a new block type: update `lib/blocks.ts` (`BLOCK_TYPES` + `BLOCK_ORDER` + **append** to `BLOCK_INDEX_TABLE`) + optional shader
- New UI panels follow the existing pattern in `components/ui/`
- All major systems are decoupled via Zustand stores
- The V2 engine sits behind a narrow API (`types/engine.ts:IVoxelEngine`); any consumer that uses the API only is shielded from internal restructuring (chunk sizes, worker shape, persistence format)

V2 is the current rebuild track. The V1 description above is preserved as historical context — once Phase 3.4 lands and `voxelStore` is retired, the V1-specific bullets in §3.1, §3.5, and §4 will move to a footer-only "V1 Legacy" appendix.

---

*This document will be expanded as we continue development.*