# Obsidian Protocol — Project Plan

**Saved:** 2026-05-20  
**Purpose:** Review snapshot of project status, documentation gaps, and recommended path forward.  
**Status when written:** V2 engine rebuild in progress; large uncommitted working tree (Phases 3.5 + 4).

---

## What This Project Is

A browser-based 3D voxel editor set in a cyberpunk "Neural Architect" fantasy:

- 12 block types with GLSL shaders, brush tools, 12 layers, chrono-log undo/redo
- Corporate contracts, reactive post-FX, audio, quality presets, IndexedDB persistence
- Polished HUD (boot sequence, neon panels, shortcuts overlay)

The **V1 autopsy** (`docs/v1_autopsy.md`) identified the core problem: main-thread state thrashing caused 80–200ms hitches above ~800–1000 voxels, even when FPS looked fine.

**V2 mandate:** move voxel state off the main thread into a Web Worker, frame-coalesce GPU writes via `RenderBridge`, add chunking, and eventually binary persistence.

---

## Where Things Stand

### Git state (as of review)

| Item | Status |
|------|--------|
| Last committed milestone | Phase **3.3 + 3.4** (`2322016`) |
| Branch | `master`, **5 commits ahead** of `origin/master` |
| Working tree | **Large uncommitted diff** — Phase 3.5 + Phase 4 appear to live here only |

Uncommitted changes include:

- `stores/voxelStore.ts` **deleted**
- UI/scene components migrated to `engine.*` / `useEngine*` hooks
- New `engine/worker/raycast.worker.ts` (untracked)
- Updated `VoxelEngine.ts`, `voxel.worker.ts`, `WorkerProtocol.ts`

**Risk:** Phase 3.5 and 4 may exist only in the working tree until committed.

### V2 phase tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 0–2 | Engine scaffolding, worker, chunks, protocol | ✅ Committed |
| 3.1 | RenderBridge + worker re-INIT | ✅ Committed |
| 3.2 | Worker as mutation authority | ✅ Working tree |
| 3.3 | `Voxels.tsx` → RenderBridge thin wrapper | ✅ Committed |
| 3.4 | All mutations → `IVoxelEngine` | ✅ Committed |
| 3.5 | Retire `voxelStore`; UI reads via engine hooks | ✅ Working tree only |
| 4 | Raycast worker + `engine.raycast()` | ✅ Working tree only (not wired to pointer input) |
| 5 | OBS2 binary persistence + `compress.worker` | ❌ Not started |

### What's working well

**V2 architecture is in place:**

```
React UI → IVoxelEngine → voxel.worker (canonical state)
                ↓
         RenderBridge → 12 pre-allocated InstancedMeshes
                ↓
         useFrame flushPending() (frame-coalesced GPU writes)
```

Key wins:

- `Voxels.tsx` is a thin wrapper — no full-rebuild `useEffect`
- Incremental stats in the worker (O(1) integrity)
- 16³ chunks with bit-packed `uint16` cells
- Five reactive hooks replace `useVoxelStore` selectors
- `uiStore` + `effectsStore` unchanged (UI/effects only)

**V1 product polish is intact:** shaders, audio, contracts, layers, chrono-log, quality presets, 5 example vaults.

### Gaps and inconsistencies

1. **Raycast worker exists but isn't used for input** — `Interaction.tsx` still uses R3F/Three.js raycasting. `engine.raycast()` is API-ready for agents/gameplay, not pointer events.

2. **Persistence is still V1 JSON** — `lib/persistence.ts` and `engine.serialize()` use JSON + IndexedDB. Phase 5 (OBS2 + RLE + compress worker) is the next big engine item.

3. **No automated tests** — zero test files in the repo.

4. **Documentation out of sync:**

   | File | Problem |
   |------|---------|
   | `docs/README (1).md` | Stuck at Phase 3.1, May 10 |
   | `docs/technical-architecture.md` | Phase table vs body disagree on 4/5 |
   | `docs/voxel-engine.md` | Says Phase 4 complete (matches working tree) |
   | `docs/how-to-extend.md` | Still points to `stores/voxelStore.ts` |
   | Root `README.md` | Lists `voxelStore`; no `engine/` folder |

5. **README roadmap items not built:** Liveblocks, WebXR, WebGPU, glTF export, greedy meshing.

---

## Architecture Snapshot

```mermaid
flowchart TD
  UI[React UI / HUD] -->|applyOps undo redo| VE[VoxelEngine]
  VE -->|postMessage| VW[voxel.worker]
  VW -->|PATCH STATS CHRONO LAYERS| VE
  VE -->|patch event| RB[RenderBridge]
  RB -->|useFrame flushPending| GPU[InstancedMesh x12]
  VW -->|OCCUPANCY_DELTA via MessageChannel| RW[raycast.worker]
  VE -->|RAY_QUERY| RW
  INT[Interaction.tsx] -->|R3F raycast NOT engine.raycast| INT
```

**Engine contract:** `types/engine.ts` → `IVoxelEngine` (mutations, sync reads, `serialize()`, `raycast()`, events).

**Stores after 3.5:** `uiStore`, `effectsStore` only — no `voxelStore`.

---

## Recommended Path Forward

### Step 1 — Stabilize (do first)

1. **Commit the working tree**, e.g.:
   - `Phase 3.5: retire voxelStore, migrate UI to engine hooks`
   - `Phase 4: raycast worker + engine.raycast() API`
2. **Validate:**
   ```bash
   npm run typecheck && npm run build
   ```
3. **Manual perf check** (the original P0 fix):
   - Load **Blackspire Arcology** (~3,100 voxels)
   - Large brush strokes, undo/redo, contract load
   - Chrome DevTools Performance: no 80–200ms long tasks
   - Compare HIGH vs BALANCED presets

If hitches remain, profile before new features. Likely culprits: brush expansion on main thread, `getAllCells()` on save, JSON serialize on large vaults.

### Step 2 — Finish V2 engine (Phase 5)

**OBS2 binary persistence** — highest-value remaining engine work:

- ~140× smaller saves (per internal docs)
- Faster load/save for large structures
- `compress.worker.ts` + wire `engine.loadSave()` / `serialize()` to binary
- **JSON ↔ OBS2 migration** for existing saves and `public/examples/`

### Step 3 — Optional Phase 4 follow-up

Only if profiling shows R3F raycasting as a bottleneck:

- Route pointer picking through `engine.raycast()`, or
- Keep R3F for UX; use worker raycast for AI/agents later

Don't prioritize unless perf data supports it.

### Step 4 — Documentation sync

| File | Action |
|------|--------|
| Rename `docs/README (1).md` → `docs/README.md` | Wiki index with current phase table |
| `docs/technical-architecture.md` | Mark phases 3.5 + 4 done; Phase 5 next |
| `docs/how-to-extend.md` | Replace `voxelStore` with `engine/` + hooks |
| Root `README.md` | Add `engine/` to structure; remove `voxelStore` |
| Root `README.md` roadmap | Split "V2 engine" vs "product roadmap" |

Optional root **STATUS.md** one-liner for quick orientation.

### Step 5 — Product direction (after V2 validated)

| Goal | Next work |
|------|-----------|
| **Portfolio demo** | Cinematic onboarding, boot flow polish, Vercel deploy |
| **Creative tool** | glTF export, greedy meshing for 10k+ voxels |
| **Multiplayer showcase** | Liveblocks |
| **Immersive** | WebXR "Neural Link" |

Defer these until V2 perf is validated and Phase 5 lands.

### Step 6 — Engineering hygiene (when bandwidth allows)

- Smoke tests for worker protocol (INIT → APPLY_OPS → PATCH → UNDO)
- CI: `typecheck` + `build` on push
- Push unpushed commits to `origin/master`

---

## Summary

**Polished V1 product + mostly-complete V2 engine rebuild.** Hard architecture work (worker state, RenderBridge, chunks, engine hooks) is in the working tree. Remaining for V2:

1. Commit and validate perf (original P0)
2. Phase 5 binary persistence
3. Sync documentation

Then choose product lane: demo, export, collab, or XR.

---

## Quick reference

| Doc | Topic |
|-----|--------|
| `docs/v1_autopsy.md` | Why V2 exists |
| `docs/technical-architecture.md` | Stack + file map |
| `docs/voxel-engine.md` | Worker, chunks, RenderBridge |
| `docs/how-to-extend.md` | Adding blocks/UI (needs V2 update) |
| `README.md` | User-facing features + setup |

---

*Generated from codebase review. Update this file when phases land or priorities change.*
