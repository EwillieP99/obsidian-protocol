# Core Features & Mechanics

Player-facing overview of what Obsidian Protocol ships today. The primary experience is a **creative 3D voxel builder Studio** — open the app and start building immediately. The lore/simulation layer (integrity meter, anomaly alerts, contracts) is **Immersive Mode**, which is off by default and can be enabled in Settings. For implementation details see [Technical Architecture](technical-architecture.md); for agent/extension rules see [How to Extend](how-to-extend.md).

---

## Studio: the primary experience

Obsidian Protocol opens as a free-form 3D voxel builder. The hero features are:

- **16-block palette** with unique emissive behaviors and animated GLSL shaders
- **Multi-layer editing** — 12 vertical layers with visibility, lock, solo, and opacity controls
- **Brush system** — 6 modes × 2 flat shapes × 2 strokes (freehand + line) with live 3D preview
- **Artifact Library** — 18 prefab stamps, region select, copy/paste (Ctrl+C/V), glTF export, save selections to library
- **Viewport HUD** — `CanvasHud` gizmo (camera, zoom, active block/layer readout) + collapsible toolbar groups
- **First-run hints** — dismissible Studio tips on first load (`FirstRunHints`)
- **Full undo/redo** with a visual chrono-log timeline
- **Persistence** — autosave, named slots, import/export (`.obs2` / `.json`)

No lore, no meters, no contracts by default — just the creative tools.

---

## The 16 Cyberpunk Block Types

**Structure**
- Obsidian, Chrome, Carbon, Corp Glass

**Neon**
- Cyan Neon, Magenta Neon, Amber Neon, Lime Neon, Violet Neon

**Energy**
- Toxic Core, Power Line

**Data**
- Data Stream, Holo Billboard, Circuit Plate, Neural Node

**Anomaly**
- Glitch Zone

Each block has unique stability, anomaly rating, emissive behavior, and (for 6 of them) custom animated GLSL shaders: Toxic Core, Neural Node, Holo Billboard, Data Stream, Glitch Zone, and Circuit Plate.

---

## Brush System

- **6 modes:** Paint, Purge (erase), Fill, Rewrite, Sample (eyedropper), **Select** (region for copy/paste)
- **2 strokes:** Freehand (drag to paint; Shift locks to one axis) and **Line** (drag A→B; fills every voxel along a 3D line in one undo step)
- **2 shapes:** Rectangle, Circle — flat layer-plane stamps (size = XZ radius; no vertical thickness)
- Adjustable size + randomness
- Live 3D preview with shape envelope, line-stroke path preview, and face-normal indicator
- Right-click drag orbits the camera; use **E** + left-drag to purge

---

## Artifact Library

- **Prefab stamps** — 18 shipped prefabs in `lib/artifacts/prefabs.ts`; stamp from the Artifact Library panel (`A`)
- **Stamp transform** — while stamping: **R** rotates 90°, **M** mirrors on X; ghost preview follows cursor (`Cursor.tsx`)
- **Region select** — Select mode (`X`) → drag two corners to define an AABB; **3D selection box** + compact **Selection HUD** show dimensions and block count
- **Copy / paste** — Ctrl+C copies selection to clipboard; Ctrl+V pastes at cursor
- **Save to library** — toolbar bookmark button saves current selection as a reusable blueprint
- **glTF export** — Toolbar IO group exports the current vault as `.glb` (`lib/exporters/gltf.ts`)
- All voxel changes route through `getEngine().applyOps()` — undo/redo via chrono-log

---

## Multi-Layer Editing

- **12 vertical layers** (Foundation through Spire Crown) — layer id **N** builds on world **Y = N**
- **Active layer** in the Layers panel sets both the edit target and the build height; paint on the ground places blocks on that stratum
- **Isolate (solo)** hides other layers and snaps the build surface to the isolated layer — no need to fly the camera up
- Per-layer visibility, lock, solo, opacity, and drag-to-reorder
- Live block counts per layer and dominant-block swatches
- Erasing or sampling an existing block still targets that cell's actual height

---

## History & Undo/Redo

- Full **chrono-log** with visual timeline
- Click any entry to time-travel (`jumpToChrono`)
- Keyboard: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo
- Cyan flash on redo, magenta flash on undo for affected cells

---

## Persistence

- **Autosave** every 20 seconds while you build (IndexedDB)
- **Named save slots** (Ctrl/⌘+S prompt in toolbar)
- **Import / export** via toolbar — accepts `.obs2` (binary) or legacy `.json`; new exports use compact OBS2 when the engine is available
- **Lazy migration:** older JSON saves in IndexedDB still load; they upgrade to binary on the next save
- **5 example vaults** in the load panel (shipped as `.json` in `public/examples/`):
  - Megaspire, Glitch Field, Velvet Shrine, Blackspire Arcology (~3,100 blocks), Ghost Cathedral

---

## Camera & Navigation

- **Presets:** Architect (overview), Street (eye-level), Neural Dive (low aerial) — keys `1` / `2` / `3`
- **Cinematic auto-rotate** — key `C`
- **Right-click drag** — orbit / look around the vault
- **Focus on selection** — double-click a block

---

## Visual & Audio Polish

- Reactive post-processing — bloom scales with neural integrity; glitch effect can be toggled in Settings. **Auto anomaly alerts** and integrity-driven glitch escalation appear only when **Immersive Mode** is enabled
- Screen shake + bloom flash on large operations (≥ 64 cells)
- Particle bursts on place/erase (capped at **360** live particles)
- Synthesized cyberpunk audio (Web Audio API) — mute with **M**
- Quality presets (**HIGH / BALANCED / PERFORMANCE**) with auto-degrade when FPS drops under load
- **Settings presets** (**STUDIO / NEON / PERF / IMMERSIVE**) — one-click bundles for scene post-FX, UI theme, and Immersive Mode; last choice persists in `localStorage`
- Boot sequence, neon HUD, CRT scanlines, keyboard shortcuts overlay (**?** / **/**)

---

## Immersive Mode (optional)

Immersive Mode is **off by default**. Enable it in **Settings**.

When enabled, it restores the full lore/simulation layer:

- Substrate integrity meter (HUD)
- Anomaly alerts and the Glitch Zone destabilization system
- Contract toolbar button (procedurally generated jobs — hotkey **N**)
- Boot lore sequence and in-universe narrative framing

When disabled (Studio mode), integrity meter, anomaly toasts, and the contract **toolbar button** are hidden. The Contract panel remains openable from the panels group if needed.

### Corporate Contracts *(Immersive Mode)*

- Procedurally generated high-stakes jobs (hotkey **N**)
- Lore-rich starting structures seeded into the vault
- Risk/reward scaling tied to substrate integrity

---

## Related docs

| Doc | For |
|-----|-----|
| [Lore](lore.md) | In-universe setting |
| [Technical Architecture](technical-architecture.md) | Stack, workers, rendering pipeline |
| [How to Extend](how-to-extend.md) | Agent playbook — constraints and file touch-lists |
| [Voxel Engine](voxel-engine.md) | Worker, chunks, RenderBridge deep dive |

---

*Last updated: 2026-05-22.*
