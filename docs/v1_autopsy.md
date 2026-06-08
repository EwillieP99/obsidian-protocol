# V1 Autopsy – Obsidian Protocol (May 2026)

> **Update (2026-05-22):** V2 Phases 0–5 and Wave A/B are complete. The P0 main-thread hitch issue is resolved via the worker-backed engine and `RenderBridge`. The palette has since expanded from 12 to **16 block types** (append-only `BLOCK_INDEX_TABLE`).

## Executive Summary
V1 is shockingly polished for a 1-hour Claude build. The cyberpunk aesthetic, shaders, audio, and core interaction loop are elite. The fantasy of being a “Lead Neural Architect” is already there.

## The P0 Killer Issue
**Main-thread state thrashing during creative flow.**

Even with InstancedMesh, every large brush stroke, undo/redo, layer change, or dense contract load causes 80–200 ms hitches. The Zustand store (especially `voxelStore`) mutates large Maps/Sets on the main thread → React reconciliation + Framer Motion + shader uniform updates all fight for the same thread.

The 60 FPS counter lies. The *feel* dies when building anything >800–1000 voxels.

## P1 Issues
- No chunking / spatial partitioning → RAM explodes on big builds
- Persistence (IndexedDB) stores raw data → slow save/load on large structures
- Input loop (raycasting) still tied to React event system
- UI and 3D engine too tightly coupled
- No Web Worker offloading for heavy compute (brush fill, RLE compression, etc.)

## What to Ruthlessly Preserve
- All 12 block types + lore
- GLSL shader system (especially per-layer color modulation)
- Chrono-log undo/redo UX
- Audio engine & cyberpunk sound design
- Neon Nexus visual identity + cinematic/tutorial flow
- Keyboard shortcuts + contract system

## V2 Mandate (NVIDIA Skunkworks)
- **Decouple completely**: UI (Next.js/React) talks to a black-box 3D engine via narrow API only.
- **Rendering**: Keep InstancedMesh but move all voxel data to raw Float32Arrays + Web Workers.
- **State**: Zustand only for UI/inventory/contracts. Core voxel data lives in typed arrays.
- **Chunking**: 16×16×16 or 32×32×32 chunks with frustum loading.
- **Persistence**: Binary + RLE compression before IndexedDB.
- **Input**: Dedicated raycast worker + predictive cursor.

This autopsy + the full V1 codebase is everything we need to feed our local agents.
