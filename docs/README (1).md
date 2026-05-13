# NEON NEXUS // Obsidian Protocol — Official Wiki

**Version:** 0.1.0  
**Status:** Active Development — V2 Engine Rebuild in progress (commit `2d42765`)  
**Last Updated:** May 10, 2026

---

## Welcome, Neural Architect

You are not building structures.  
You are stabilizing a living intelligence.

**Obsidian Protocol** is a browser-based, R3F-powered 3D voxel editor set in the year 2077. You play as the Lead Neural Architect for Neon Nexus Megacorp, responsible for sculpting and maintaining the Obsidian Vault — the city’s living AI consciousness.

This wiki contains everything you need to understand, play, and extend the system.

---

## Quick Navigation

### Player Guides
- [Lore & World](lore.md)
- [Core Features & Mechanics](features.md)

### Technical Documentation
- [Technical Architecture](technical-architecture.md) — V1 + V2 overview
- [Voxel Engine & Rendering](voxel-engine.md) — V2 worker engine + V1 historical
- [Shader System](shaders.md)
- [How to Extend](how-to-extend.md)
- [V1 Autopsy](v1_autopsy.md) — what V2 was built to fix

> **Doc TBD:** `shortcuts.md`, `cinematic-onboarding.md`, `state-management.md`
> are referenced in older drafts but haven't been written yet.

---

## Current Development Focus

**V2 engine rebuild.** V1 is aesthetically complete but hitches 80–200 ms on
brush strokes above ~800 voxels — see [V1 Autopsy](v1_autopsy.md). V2 moves
voxel data into a Web Worker and replaces the V1 full-rebuild render loop with
a frame-coalesced GPU patcher (`RenderBridge`).

**Shipped so far:**

| Phase | Commit | What |
|---|---|---|
| 0–2 | `5f215f9` | API surface, wire protocol, chunk model, voxel.worker (state ownership + chrono-log + incremental stats), VoxelEngine spawns + seeds the worker |
| 3.1 | `2d42765` | `RenderBridge` (SlotAllocator + 12 InstancedMesh × MAX_INSTANCES), worker re-INIT support |

**In flight:** Phase 3.2 (engine flips to worker-canonical), 3.3 (rewrite
`Voxels.tsx` around `RenderBridge`), 3.4 (migrate mutation callsites to
`engine.*`). Phase 4 = raycast worker. Phase 5 = OBS2 binary persistence.

The V1 cinematic onboarding work referenced in older drafts is paused while
the engine rebuild lands.

---

*“Every glyph you place draws power from the city grid. Every glitch zone threatens substrate integrity. Build well, Architect.”*