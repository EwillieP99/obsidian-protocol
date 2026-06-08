# NEON NEXUS // Obsidian Protocol — Official Wiki

**Version:** 0.1.0  
**Status:** Active Development — V2 engine complete; Wave A + Wave B (except greedy meshing) shipped; Wave D polish partial  
**Last Updated:** May 22, 2026

---

## Welcome, Neural Architect

You are not building structures.  
You are stabilizing a living intelligence.

**Obsidian Protocol** is a browser-based, R3F-powered 3D voxel editor set in the year 2077. You play as the Lead Neural Architect for Neon Nexus Megacorp, responsible for sculpting and maintaining the Obsidian Vault — the city's living AI consciousness.

This wiki contains everything you need to understand, play, and extend the system.

---

## Quick Navigation

### Player Guides
- [Lore & World](lore.md)
- [Core Features & Mechanics](features.md)

### Technical Documentation
- [Technical Architecture](technical-architecture.md) — stack, file map, rendering pipeline
- [Voxel Engine & Rendering](voxel-engine.md) — worker engine deep dive (source of truth for phases)
- [Shader System](shaders.md)
- [How to Extend](how-to-extend.md)
- [V1 Autopsy](v1_autopsy.md) — what V2 was built to fix

### Project Status
- [Project Plan](PROJECT_PLAN.md) — wave tracker, gaps, recommended next steps
- [Deploy](deploy.md) — Vercel + CI + smoke checklist

> **Doc TBD:** `shortcuts.md`, `cinematic-onboarding.md`, `state-management.md`
> are referenced in older drafts but haven't been written yet. In-app shortcuts
> overlay (`?` / `/`) and root `README.md` cover bindings today.

---

## Current Development Focus

**V2 engine rebuild.** V1 is aesthetically complete but hitches 80–200 ms on
brush strokes above ~800 voxels — see [V1 Autopsy](v1_autopsy.md). V2 moves
voxel data into Web Workers and replaces the V1 full-rebuild render loop with
a frame-coalesced GPU patcher (`RenderBridge`).

**Phase tracker — Phases 0–5 complete; Wave A + Wave B shipped (`3f95ec0`):**

| Phase | Commit | Status | What |
|---|---|---|---|
| 0–2 | `5f215f9` | ✅ | Engine scaffolding, worker stand-up, chunk model, wire protocol |
| 3.1 | `2d42765` | ✅ | `RenderBridge` (SlotAllocator + 16 InstancedMesh × MAX_INSTANCES), worker re-INIT |
| 3.2–3.4 | `2322016` | ✅ | Worker as mutation authority; `Voxels.tsx` thin wrapper; all sites call `engine.*` |
| 3.5 | `8f7e9e8` | ✅ | `voxelStore` deleted; UI reads via `useEngine*` hooks |
| 4 | `8f7e9e8` | ✅ | `raycast.worker` + `engine.raycast()` (pointer input still uses R3F) |
| 5 | `3f95ec0` | ✅ | OBS2 binary saves via `compress.worker`; `lib/persistence.ts` ArrayBuffer I/O + JSON fallback |

**Product focus (Wave A + B):** Studio mode (Immersive off by default), collapsible toolbar groups, Artifact Library (18 prefabs + region copy/paste + stamp with rotate/mirror ghost), selection box + HUD, line-stroke brush, glTF export, settings presets (STUDIO / NEON / PERF / IMMERSIVE), HUD reskin (`CanvasHud`, `FirstRunHints`).

**Quality:** Blackspire Arcology (~3,100 blocks) feel-test passed — paint/erase/undo smooth, no V1-style main-thread hitches. **19 Vitest tests** + Playwright smoke E2E in CI.

**Next up:** Spike C agent research memo, Vercel production URL (D2), optional B5 greedy meshing spike, Liveblocks/WebXR/WebGPU remain roadmap-only. See [Project Plan](PROJECT_PLAN.md).

---

*“Every glyph you place draws power from the city grid. Every glitch zone threatens substrate integrity. Build well, Architect.”*
