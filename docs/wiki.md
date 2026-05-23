# NEON NEXUS // Obsidian Protocol — Official Wiki

**Version:** 0.1.0  
**Status:** Active Development — V2 engine Phases 0–5 complete; Wave A product features (Studio/Immersive, Artifact Library) landing  
**Last Updated:** May 21, 2026

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
- [Project Plan](PROJECT_PLAN.md) — phase tracker, gaps, recommended next steps

> **Doc TBD:** `shortcuts.md`, `cinematic-onboarding.md`, `state-management.md`
> are referenced in older drafts but haven't been written yet. In-app shortcuts
> overlay (`?` / `/`) and root `README.md` cover bindings today.

---

## Current Development Focus

**V2 engine rebuild.** V1 is aesthetically complete but hitches 80–200 ms on
brush strokes above ~800 voxels — see [V1 Autopsy](v1_autopsy.md). V2 moves
voxel data into Web Workers and replaces the V1 full-rebuild render loop with
a frame-coalesced GPU patcher (`RenderBridge`).

**Phase tracker — Phases 0–5 complete; Wave B creative depth next:**

| Phase | Commit | Status | What |
|---|---|---|---|
| 0–2 | `5f215f9` | ✅ | Engine scaffolding, worker stand-up, chunk model, wire protocol |
| 3.1 | `2d42765` | ✅ | `RenderBridge` (SlotAllocator + 12 InstancedMesh × MAX_INSTANCES), worker re-INIT |
| 3.2–3.4 | `2322016` | ✅ | Worker as mutation authority; `Voxels.tsx` thin wrapper; all sites call `engine.*` |
| 3.5 | `8f7e9e8` | ✅ | `voxelStore` deleted; UI reads via `useEngine*` hooks |
| 4 | `8f7e9e8` | ✅ | `raycast.worker` + `engine.raycast()` (pointer input still uses R3F) |
| 5 | Wave A | ✅ | OBS2 binary saves via `compress.worker`; `lib/persistence.ts` writes ArrayBuffers with JSON fallback on load |

**Product focus (Wave A):** Studio mode (Immersive off by default), collapsible toolbar groups, Artifact Library (prefabs + region copy/paste + stamp), layer dominant-block swatches.

**Validated:** Blackspire Arcology (~3,100 blocks) feel-test passed — paint/erase/undo smooth, no V1-style main-thread hitches (May 2026).

**Next up:** Wave B creative tool depth — stamp polish, selection overlay, glTF export, Vitest tests (see [Project Plan](PROJECT_PLAN.md)). Deploy via Vercel using root `vercel.json`.

The V1 cinematic onboarding work referenced in older drafts remains paused while
the engine rebuild lands.

---

*“Every glyph you place draws power from the city grid. Every glitch zone threatens substrate integrity. Build well, Architect.”*
