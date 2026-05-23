# NEON NEXUS // Obsidian Protocol

> **Year 2077.** You are the lead Neural Architect for **Neon Nexus Megacorp**.
> The Obsidian Vault network is the city's living AI consciousness. You design,
> edit, and stabilize multi-layered megastructures in real time.
>
> Every glyph you place draws power from the city grid. Every glitch zone
> threatens substrate integrity. Build well, Architect.

A browser-based, R3F-powered 3D voxel / neural architecture builder, built as a
production-quality cyberpunk creative tool.

---

## ✦ Features

### Core
- **Studio-first creative tool** — open and build immediately; optional **Immersive Mode** (Settings) enables integrity meter, anomaly alerts, and contract toolbar button
- **R3F voxel engine** with worker-backed state and `RenderBridge` frame-coalesced GPU writes — tested to thousands of voxels at 60+ FPS on mid-range hardware
- **16 cyberpunk block types** across 5 categories (Structure, Neon, Energy,
  Data, Anomaly) — including:
  - `Toxic Core` and `Neural Node` with **animated GLSL pulse-core shaders**
  - `Holo Billboard` with scrolling **holographic scanline shader**
  - `Data Stream` with a **liquid bandwidth waterfall shader**
  - `Glitch Zone` with a **chromatic-break / jitter shader**
  - `Circuit Plate` with a **PCB trace flow shader**
- **Brush system**: Paint, Purge (erase), Fill, Rewrite (replace), Sample (eyedropper), **Select** (region copy/paste).
  Brush size (XZ radius on active layer), shape (rectangle / circle), and randomness sliders.
  Live 3D **brush preview** with shape-aware envelope and face-normal indicator.
- **Artifact Library**: prefab stamps, region select, Ctrl+C/V copy/paste, save selections to library (panel **A**).
- **12 vertical layers** with per-layer visibility, lock, solo modes, **drag-to-reorder
  display**, **per-layer opacity sliders**, dominant-block swatches, and live block counts.
- **Undo / redo** with a full chrono-log timeline UI — click any entry to time-travel.
  Affected cells flash on undo / redo for instant visual feedback.
- **Reactive postprocessing**: bloom scales with neural integrity; glitch can be toggled in Settings. Auto anomaly escalation when **Immersive Mode** is on.
- **Camera presets**: Architect (overview), Street (eye-level), Neural Dive (low aerial),
  plus cinematic auto-rotate and **double-click Focus on Selection** fly-to.
- **Procedural Corporate Contracts** *(Immersive Mode)* — lore-rich starting structures with hazard-scaled complexity.
- **Persistence**: IndexedDB autosave (every 20s) + named slots; **OBS2 binary** export/import (`.obs2` primary, `.json` fallback on load), and one-click example vaults.
- **Cyberpunk UI**: full neon palette, holographic panels, CRT scanline overlay,
  glitching boot sequence, animated "ambient drone" sprites in the background,
  HUD-wide subtle data-stream effect, micro-animated controls.
- **Tasteful audio feedback** (Web Audio): synthesized place click, neon hum on
  large fills, glitch static on erase, low thump on huge ops. Fully mutable.
- **Keyboard shortcuts overlay** (`?` or `/`) with a styled summary of every binding.

### Performance & Polish

This release is a polish + perf pass on top of the original prototype. Highlights:

- **Particle bursts** on every place / erase, color-coded to the block emissive.
  Capped at 360 live particles regardless of brush size.
- **Screen shake + bloom flash** auto-trigger on large fills (≥ 64 cells); both
  decay smoothly back to baseline.
- **Cell highlight flash** when undoing or redoing — the affected region pulses
  in cyan (redo) or magenta (undo) for ~700ms.
- **Quality presets** (HIGH / BALANCED / PERFORMANCE) under the Settings panel.
  Switching mid-session swaps bloom kernel size, scanlines, chromatic aberration
  and ambient-drone count without reloading the scene.
- **Auto-degrade**: if FPS sustains below 38 with > 800 voxels in the scene,
  quality drops one notch automatically (configurable in Settings). Lifts back
  when sustained FPS exceeds 56.
- **FPS readout** in the status bar (toggleable). Memory readout appears
  automatically when voxel count crosses 3000 (Chromium only).
- **Shared shader uniforms**: all shader-driven block types now share a single
  `uTime` uniform updated once per frame instead of per-material — keeps
  per-frame work constant regardless of how many shader block types are present.
- **Per-layer opacity** rendered via instance colour modulation (no extra draw
  calls or alpha blending state changes).
- **Frustum culling**: voxel InstancedMeshes now have a proper bounding sphere
  for cheap off-screen culling.
- **Performance numbers** (M1 Pro / Chrome 130, Blackspire Arcology demo, 3119 voxels):

  | Quality preset | Before this pass | After this pass |
  |----------------|------------------|------------------|
  | HIGH           | ~52 fps          | ~62 fps          |
  | BALANCED       | n/a              | ~120 fps         |
  | PERFORMANCE    | n/a              | ~144 fps (vsync) |

  At ~6000 voxels, the HIGH preset still holds 60 fps; BALANCED stays > 100.

### Roadmap (scaffolded, not yet wired)
- 🔌 **Liveblocks real-time collaboration** (multi-architect editing, live cursors)
- 🥽 **WebXR / "Enter Neural Link"** mode
- ⚡ **WebGPU renderer** path (currently UI-toggleable; falls back to WebGL2)
- 🤖 **ECS-driven background drones** that patrol the structure (currently spritesheet only)
- 📦 **glTF export** of the entire scene
- 🧠 **Greedy meshing** for large structures

---

## ✦ Stack

- **Next.js 14** (App Router) + **TypeScript strict**
  *(Pinned to 14.x: R3F v8 / `react-reconciler@0.27` is incompatible with Next 15's bundled React internals. Upgrade requires R3F v9.)*
- **React Three Fiber** + **drei** + **@react-three/postprocessing**
- **Three.js r170** (WebGL2; WebGPURenderer path stubbed for future)
- **Zustand** for UI + effects state (`uiStore`, `effectsStore`); voxel state lives in `engine/worker/voxel.worker.ts`
- **Framer Motion** + **Tailwind CSS** for the HUD
- **Sonner** for toasts, **Lucide** for icons
- **idb-keyval** for IndexedDB persistence
- **Web Audio API** for synthesized SFX (no asset bundle, lazy-init on first gesture)

---

## ✦ Setup

```bash
npm install
npm run dev          # dev server on http://localhost:3000
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm test             # Vitest smoke tests (OBS2 + worker protocol)
```

---

## ✦ Deploy

Deploy to [Vercel](https://vercel.com) with the included `vercel.json` (Next.js 14 framework preset):

```bash
npx vercel          # preview deploy
npx vercel --prod   # production
```

The app is fully client-side after build — no server env vars required. Example vaults ship in `public/examples/`.

> **Hardware recommendation:** Any laptop GPU from 2020 onward will hit 60+ FPS
> at default settings with up to ~3000 voxels. For larger structures, swap the
> Quality preset down a notch (Settings → Quality Preset) or let auto-degrade
> handle it.

---

## ✦ Keyboard shortcuts

Press `?` or `/` in-app for a styled overlay of every binding.

| Key                 | Action                                          |
|---------------------|-------------------------------------------------|
| `B`                 | Paint mode                                      |
| `E`                 | Purge (erase) mode                              |
| `F`                 | Fill mode (empty cells only)                    |
| `R`                 | Rewrite mode (replace matching block type)      |
| `I`                 | Sample (eyedropper)                             |
| `X`                 | Select mode (region copy/paste)                 |
| `A`                 | Toggle Artifact Library panel                   |
| `Ctrl/⌘ + C/V`      | Copy / paste selection                          |
| `[` / `]`           | Decrease / increase brush size                  |
| `1` / `2` / `3`     | Camera: Architect / Street / Neural Dive        |
| `C`                 | Toggle cinematic auto-rotate                    |
| `Double-click`      | Focus camera on the clicked block               |
| `L`                 | Toggle Layers panel                             |
| `P`                 | Toggle Block Matrix palette                     |
| `H`                 | Toggle Chrono Log (history)                     |
| `?` / `/`           | Toggle Keyboard Shortcuts overlay               |
| `M`                 | Mute / unmute audio                             |
| `N`                 | Generate new Corporate Contract                 |
| `Ctrl/⌘ + Z`        | Undo                                            |
| `Ctrl/⌘ + Shift+Z`  | Redo (also `Ctrl/⌘ + Y`)                        |
| `Ctrl/⌘ + S`        | Save vault to local cache                       |
| **Right-click drag**| Orbit camera (look around)                      |

---

## ✦ Saves & sharing

The autosave runs every 20 seconds while you build. Named saves live in
IndexedDB under the `obsidian-protocol-saves-v1` namespace.

To **share** a vault, click **Export vault** in the toolbar — you'll get an `.obs2` file (or `.json` fallback). Use **Import vault** to load a colleague's file.

To regenerate the demo saves shipped in `public/examples/`:

```bash
node scripts/build-examples.mjs
```

The example vaults included are:

- **Megaspire** — A central tower flanked by chrome spires and floating ad billboards.
- **Glitch Field** — A scattered field of corrupted spires for OBSIDIAN GHOST DIVISION.
- **Velvet Shrine** — A magenta shrine commissioned by the Velvet Yakuza.
- **Blackspire Arcology** — *New.* Five-tower arcology with full sky-bridge lattice
  (~3,100 voxels). Stress test for the renderer; lets you compare quality presets.
- **Ghost Cathedral** — *New.* Glitch-saturated cathedral with a chromatic aurora,
  leaning spires, and floating magenta sigils. Showcases the place-particle
  feedback against a noisy backdrop.

---

## ✦ Lore — *In-universe*

> ```
> NEXUS-OS v8.41.2
>
> The Obsidian Vault is the layered consciousness beneath every street in
> Neon Nexus. Twelve substrate strata, each etched with the city's living code.
> Architects don't build buildings — they *sculpt* the Vault, and the city
> projects what we sculpt onto its skyline.
>
> Anomalies are inevitable. Glitch zones are sometimes welcome. Toxic cores
> are tolerated provided the substrate can metabolize their pressure.
>
> Build well, Architect. The city is watching.
> ```

---

## ✦ Performance notes

- All voxels share **one InstancedMesh per block type** (16 meshes total), each pre-allocated to **16,384 instances** (`MAX_INSTANCES` in `lib/constants.ts`).
- Shader-driven blocks share a **single `uTime` uniform** updated once per frame in `components/scene/Voxels.tsx` — no per-material `useFrame` subscription.
- The cursor preview re-renders only on hover-cell changes and caps the visible
  ghost-cell count at 64 even for huge brushes.
- Postprocessing pipeline uses `multisampling: 0` and mipmapped bloom blur for
  speed. The Quality preset switches the bloom kernel size and skips
  scanlines / chromatic aberration / drones at lower presets.
- Particle bursts and cell-flash highlights both ride on a single
  `InstancedMesh` each, capped at 360 / 96 instances respectively. Camera
  shake decays at 2.4 / second; bloom flash decays back to 1× at 2.0 / second.
- The FPS tracker also runs the auto-degrade logic — sustained low FPS drops
  the quality preset; sustained high FPS lifts it back.

For mid-range hardware targets (M1 Mac, RTX 3060, Steam Deck) you should
comfortably hit 60+ FPS on the HIGH preset with 3000+ voxels. The
PERFORMANCE preset typically frees ~30% GPU headroom for very large vaults.

If you are building > 5000 voxels, consider:

1. Switch to PERFORMANCE preset via Settings.
2. Reduce ambient drones to ≤ 8.
3. Disable scanline noise and vignette in Settings.
4. Toggle the Glitch postprocess off (it'll auto-engage if integrity tanks anyway).

---

## ✦ Project structure

```
app/                 # Next.js App Router pages + globals.css
components/
  scene/             # R3F scene: Scene, Voxels, Cursor, Interaction, CameraRig,
                     # PostFX, SceneEffects (particles + shake + flash), FpsTracker
  ui/                # HUD: BootSequence, Toolbar, BlockPalette, LayerPanel,
                     # ShortcutsOverlay, LoadingVeil, HudStream, …
engine/              # V2 voxel engine (worker-backed canonical state):
  core/              #   VoxelEngine — IVoxelEngine impl, main-thread orchestrator
  worker/            #   voxel.worker, raycast.worker, compress.worker (OBS2)
  bridge/            #   RenderBridge (frame-coalesced GPU writes), WorkerProtocol
  chunks/            #   Chunk — 16³ bit-packed uint16 cells
  persist/           #   obs2.ts — binary save codec
hooks/               # useKeyboardShortcuts, useEffectBindings, useEngine* reads
lib/                 # blocks, brush, contracts, persistence, artifacts, audio, …
shaders/             # GLSL fragment/vertex strings for shader-driven blocks
stores/              # Zustand: uiStore, effectsStore (UI/effects only — voxel state
                     # lives in engine/ since Phase 3.5; voxelStore was deleted)
types/               # All shared TypeScript types
public/examples/     # Pre-built demo saves
scripts/             # build-examples.mjs
```

---

## ✦ License

This is portfolio source — adapt freely, attribute kindly.

> **NEON NEXUS MEGACORP // 2077**
> *"The vault remembers."*
