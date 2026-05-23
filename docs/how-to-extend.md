# How to Extend Obsidian Protocol

**Audience:** coding agents (Cursor, Claude Code, etc.)  
**Read first:** [Core Features & Mechanics](features.md) (what the product does) and [Technical Architecture](technical-architecture.md) (how it is built). For engine internals, also see [Voxel Engine](voxel-engine.md).

This doc is the **agent playbook**: constraints, vocabulary mapping, and file touch-lists. It does not duplicate the architecture deep dive — it tells you where to plug in without breaking V2.

---

## Product ↔ code vocabulary

Use the same names as [features.md](features.md). Internal identifiers are in parentheses.

| Product (UI / docs) | Code (`types/`, `lib/`) |
|---------------------|-------------------------|
| 16 block types (Structure / Neon / Energy / Data / Anomaly) | `BlockId` in `lib/blocks.ts` — see list in [technical-architecture §5](technical-architecture.md#5-data-model) |
| 6 shader-driven blocks | `shader` field on block def; GLSL in `shaders/index.ts`; wired in `RenderBridge.ts` |
| Paint / Purge / Fill / Rewrite / Sample / Select | `paint` / `erase` / `fill` / `replace` / `eyedropper` / `select` (`BrushMode` in `types/index.ts`) |
| Rectangle / Circle brush shapes | `rectangle` / `circle` (`BrushShape`) |
| 12 vertical layers | `WORLD_HEIGHT = 12` in `lib/constants.ts`; layer ops via `IVoxelEngine` |
| Chrono-log undo/redo | `engine.undo()` / `redo()` / `jumpToChrono()`; UI via `useEngineChrono()` |
| Corporate Contracts | `lib/contracts.ts` + `useEngineContract()` |
| Autosave / named saves / import-export | `lib/persistence.ts` → `engine.serialize()` / `loadSave()` (OBS2 binary; JSON fallback on load) |
| Post-FX, particles, shake, audio | `PostFX.tsx`, `SceneEffects.tsx`, `hooks/useEffectBindings.ts`, `stores/effectsStore.ts` |
| Quality presets (HIGH / BALANCED / PERFORMANCE) | `uiStore` settings |
| Immersive Mode toggle | `uiStore.immersiveMode` (boolean, default `false`) |
| Artifact Library / blueprints | `lib/artifacts.ts`, `lib/artifacts/prefabs.ts`, `ArtifactLibraryPanel.tsx`; `uiStore` `selectionStart/End`, `clipboard`, `stampArtifact` |

---

## Hard constraints (do not violate)

1. **`stores/voxelStore.ts` is deleted.** Never recreate a Zustand store for cells, history, layers, stats, or contract. Canonical state is in `engine/worker/voxel.worker.ts`.

2. **React/UI must not import from `engine/`.** Use `hooks/useEngine.ts` (`getEngine()`, `useEngine*`) and `types/engine.ts` (`IVoxelEngine`, `CellOp`, `CellDelta`). Engine modules must not import React or Zustand.

3. **All voxel mutations go through `IVoxelEngine`.** `applyOps`, `undo`, `redo`, `clearAll`, `loadSave`, layer ops — never write to chunk data from a component.

4. **`BLOCK_INDEX_TABLE` is append-only.** New blocks get a new trailing index. Reordering or inserting breaks OBS2 saves and the worker wire format. See [technical-architecture §5](technical-architecture.md#5-data-model).

5. **Do not add full-rebuild render paths.** GPU updates flow: worker `PATCH` → `RenderBridge.queueDeltas()` → `flushPending()` in `Voxels.tsx` `useFrame`. No `useEffect` that rebuilds all instances from a cells Map.

6. **Pointer picking stays on R3F for now.** `Interaction.tsx` uses Three.js/R3F raycasting. `engine.raycast()` is for non-pointer queries only unless explicitly tasked to migrate input.

7. **Performance budgets** (from [features.md](features.md)): particles ≤ 360; avoid `getAllCells()` except save/load; shader blocks share one `uTime` updated in `Voxels.tsx` — no per-material `useFrame`.

8. **Next.js 14 only.** Do not upgrade to Next 15 without R3F v9 migration (see technical-architecture §1).

---

## Where state lives

| Data | Owner | UI access |
|------|--------|-----------|
| Cells, history, layers, stats, contract | `voxel.worker.ts` (via `VoxelEngine` caches) | `useEngine*` hooks or `getEngine()` sync reads |
| Brush, active block, panels, camera, quality | `stores/uiStore.ts` | `useUIStore` |
| Particles, shake, bloom flash, focus | `stores/effectsStore.ts` | `useEffectsStore` |
| Immersive Mode flag | `stores/uiStore.ts` | `useUIStore(s => s.immersiveMode)` |

---

## Decision tree: what files to touch

```
Adding a block type?
  → lib/blocks.ts (BLOCK_TYPES, BLOCK_ORDER, append BLOCK_INDEX_TABLE)
  → optional: shaders/index.ts + RenderBridge buildShaderMaterial switch
  → NOT voxel.worker unless custom wire semantics

Adding HUD / panel?
  → components/ui/*, uiStore panels, App.tsx
  → read vault via useEngine* hooks

Toggling Immersive Mode UI (integrity meter, anomaly alert, contract toolbar button)?
  → stores/uiStore.ts (immersiveMode flag)
  → components/ui/IntegrityMeter.tsx, AnomalyAlert.tsx, SettingsPanel.tsx, Toolbar.tsx
  → Do NOT change engine/worker — integrity math runs regardless
  → ContractPanel is not gated by default (toolbar N button is)

Adding Artifact Library feature / stamp / clipboard?
  → lib/artifacts.ts, lib/artifacts/prefabs.ts, ArtifactLibraryPanel.tsx
  → Interaction.tsx (select + stamp), useKeyboardShortcuts.ts, uiStore selection/clipboard/stamp
  → All voxel mutations via getEngine().applyOps()

Adding brush mode or shape?
  → types/index.ts (BrushMode / BrushShape if new enum value)
  → lib/brush.ts, Interaction.tsx, uiStore, Toolbar, useKeyboardShortcuts, ShortcutsOverlay

Adding edit feedback (particles, SFX)?
  → hooks/useEffectBindings.ts (subscribe engine 'patch')
  → stores/effectsStore.ts, lib/audio.ts

Changing save format or migration?
  → engine/persist/obs2.ts, engine/worker/compress.worker.ts, VoxelEngine, lib/persistence.ts

Changing undo/history/chunk behavior?
  → engine/worker/voxel.worker.ts, WorkerProtocol.ts, possibly VoxelEngine.ts

Changing GPU rendering / instancing?
  → engine/bridge/RenderBridge.ts, components/scene/Voxels.tsx (thin — prefer RenderBridge)
```

---

## Recipe: new block type

Matches [technical-architecture §7](technical-architecture.md#7-future-proofing--extensibility).

1. `lib/blocks.ts` — add to `BLOCK_TYPES` (include `stability`, `anomaly`, `category`, optional `shader`, `transparent` for data-stream-like blocks).
2. `BLOCK_ORDER` — palette order.
3. **`BLOCK_INDEX_TABLE` — append only** at the end (after index 12 `glitch` today).
4. Optional shader — add GLSL exports to `shaders/index.ts`; register in `RenderBridge.ts` `buildShaderMaterial` (see [shaders.md](shaders.md)).
5. No worker edit required — `blockIdToIndex` / `indexToBlockId` handle the wire mapping.

Existing animated shaders: `pulse-core`, `holo`, `data-waterfall`, `glitch`, `circuit` (6 blocks total per features.md).

---

## Recipe: new UI panel

1. `components/ui/MyPanel.tsx` — use `panel` class from `app/globals.css`.
2. `stores/uiStore.ts` — add under `panels`; wire toggle in Toolbar/shortcuts if needed.
3. `components/App.tsx` — render when panel open.

| Panel needs… | Use |
|--------------|-----|
| Integrity, cell count, anomaly | `useEngineStats()` |
| Layers, active layer, layer mutations | `useEngineLayers()` + `getEngine().setLayer*` |
| History timeline | `useEngineChrono()` |
| Contract | `useEngineContract()` |
| Blocks per layer | `useLayerCounts()` |

Keep brush/camera/settings in `uiStore` only.

---

## Recipe: new keyboard shortcut

`hooks/useKeyboardShortcuts.ts` — add handler; call `getEngine()` for vault ops, `useUIStore.getState()` for UI toggles. Mirror binding in `components/ui/ShortcutsOverlay.tsx` if user-facing.

---

## Recipe: programmatic voxel changes

From UI, contracts, or tools — always:

```ts
import { getEngine } from '@/hooks/useEngine';

getEngine().applyOps(
  [{ x, y, z, blockId: 'neon-cyan', layer: y }],
  'Descriptive label', // appears in chrono-log; undo/redo flash keys off "Undo: " / "Redo: " prefixes
);
```

Bulk load: `getEngine().loadSave(arrayBuffer)` — OBS2 or JSON (engine sniffs magic bytes).  
Bulk save: `await getEngine().serialize(name?, thumbnail?)` — prefer `lib/persistence.ts` helpers for IndexedDB/file export.

Contracts: `lib/contracts.ts` — follow `generateContract` / `applyContract`; they already use the engine API.

---

## Recipe: edit feedback (particles / audio / shake)

Do not poll voxel state. Subscribe in `hooks/useEffectBindings.ts` to engine `'patch'` events (same pattern as undo/redo flash detection). Trigger via `stores/effectsStore.ts` and `lib/audio.ts`. Cap particles at 360.

---

## Recipe: new brush mode (only if tasked)

Touch list (keep in sync with [features.md brush section](features.md#brush-system)):

1. `types/index.ts` — extend `BrushMode`
2. `lib/brush.ts` — `operationsForBrush`
3. `components/scene/Interaction.tsx` — mode-specific logic (see `eyedropper`, `replace`)
4. `stores/uiStore.ts`, `Toolbar.tsx`, `useKeyboardShortcuts.ts`, `ShortcutsOverlay.tsx` — labels and hotkeys

Brush ops expand on the **main thread** for `Cursor.tsx` preview, then post `CellOp[]` to the worker via `applyOps`.

---

## Engine file reference

Full map: [technical-architecture §2](technical-architecture.md#2-high-level-architecture). Quick index:

| File | Agent may edit when… |
|------|----------------------|
| `types/engine.ts` | Changing public `IVoxelEngine` contract (rare; coordinate with all call sites) |
| `engine/core/VoxelEngine.ts` | New engine methods, worker lifecycle, event types |
| `engine/bridge/WorkerProtocol.ts` | New worker messages |
| `engine/worker/voxel.worker.ts` | History, chunks, stats, layer canonical logic |
| `engine/worker/raycast.worker.ts` | Non-pointer ray queries only |
| `engine/worker/compress.worker.ts` | OBS2 encode/decode RPC |
| `engine/persist/obs2.ts` | Save format |
| `engine/bridge/RenderBridge.ts` | Instancing, materials, shaders on meshes |
| `engine/chunks/Chunk.ts` | Cell packing (high risk — migration implications) |

Prefer extending through `IVoxelEngine` and existing hooks before adding worker messages.

---

## Verification checklist (agent)

After any extension:

- [ ] `npm run typecheck` passes
- [ ] No new imports from `engine/` inside `components/` or `hooks/` (except the established bridge in `useEngine.ts` / `VoxelEngine` entry)
- [ ] No new Zustand store holding voxel data
- [ ] If block added: `BLOCK_INDEX_TABLE` appended, not reordered
- [ ] Large-scene smoke: load Blackspire Arcology (~3,100 cells), paint + undo — no main-thread hitch (V2 target)
- [ ] If persistence touched: save → reload round-trip in browser

---

## Out of scope unless explicitly requested

Roadmap items from features/README — **not built**: Liveblocks, WebXR, WebGPU renderer, greedy meshing, migrating pointer input to `engine.raycast()`. **Built:** glTF export (`lib/exporters/gltf.ts`), OBS2 persistence, Vitest smoke tests.

- `Custom block colors / user-defined swatches (free-form hex → new paintable block)`

Do not scope-creep these into unrelated tasks.

### Future phase: user swatches / custom block colors

**Not implemented.** The Block Matrix selects from fixed `BlockId` entries in `lib/blocks.ts`. Settings → **UI THEME** recolors interface chrome only — it does not change voxel materials.

If requested later, a real custom-color feature would require:

1. **Save format** — extend OBS2 / worker cell encoding beyond fixed `BlockId` (or reserve slots for user swatch indices).
2. **Renderer** — refactor `engine/bridge/RenderBridge.ts` from one `InstancedMesh` per block type to per-instance color (likely a generic opaque mesh + instance attributes), with limits (e.g. max 16 swatches per vault) for GPU perf.
3. **UI** — color picker, optional emissive toggle, swatch naming, persistence in save files.
4. **Eyedropper** — already samples existing fixed block types via SAMPLE mode (`Interaction.tsx`); custom swatches would extend that path.

Until then, add curated presets by appending to `BLOCK_INDEX_TABLE` (see recipe above) — do not build a free color picker in the Block Matrix.

---

*Agent playbook — aligned with [features.md](features.md) and [technical-architecture.md](technical-architecture.md). Last updated: 2026-05-20.*
