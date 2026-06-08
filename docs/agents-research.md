# Generative Voxel Agents — Architecture Spec (Spike C / C1)

**Status:** Research memo. No application code shipped yet. This is the design
of record for a future **Wave E**.
**Last updated:** 2026-06-08
**Read first:** [how-to-extend.md](how-to-extend.md) (hard constraints),
[technical-architecture.md](technical-architecture.md) (engine internals),
[PROJECT_PLAN.md](PROJECT_PLAN.md) (wave/ticket context).

> **Provenance.** This memo folds three rounds of external "deep research" into
> a single spec, **corrected against the actual engine**. The source research
> repeatedly described a *generic* voxel app — inventing a history engine, a
> physics/stability ruleset, and a render-staging shader the codebase neither
> has nor needs. Every such drift is flagged below under **Ground-truth
> corrections** so nobody re-imports the fiction. When in doubt, the code wins.

---

## 0. The core insight

Everything the UI does to the vault crosses **one choke point**:

```ts
getEngine().applyOps(ops: CellOp[], label: string)
//   CellOp = { x, y, z, blockId: BlockId | null, layer: number }
```

So **"an agent builds in the engine" reduces to "natural language → `CellOp[]`."**
Because `applyOps` flows through the normal worker → `PATCH` pipeline, an agent
inherits — for free, with zero new infrastructure:

- **Undo** — one `applyOps` = one Chrono-Log entry. `"AI: build a watchtower"`
  is a single Ctrl+Z.
- **Effects** — particles / audio / shake fire off the `patch` event regardless
  of who caused the mutation.
- **Persistence, integrity math, rendering** — all downstream of the same pipe.

Hard constraint #3 ("all mutations via `IVoxelEngine`") is not a limitation for
the agent — it is the **seam that makes the agent safe**. The agent is just
another caller of `applyOps`. **No engine surgery is required for an MVP.**

---

## 1. Engine inventory (the real surface)

### 1.1 Mutation surface — `IVoxelEngine` (`types/engine.ts`)

```ts
applyOps(ops: CellOp[], label: string): void   // the only build primitive needed
undo(); redo(); jumpToChrono(entryId); clearAll(); loadSave(buf)
setActiveLayer / setLayerVisibility / setLayerLock / setLayerSolo /
setLayerOpacity / moveLayer / renameLayer
```

`CellOp = { x, y, z, blockId: BlockId | null, layer: number }`. `blockId: null`
erases. **The agent never computes a linear cell index** — the worker packs it
(`cellIdx = y*WORLD_XZ + z*WORLD_X + x = x + z*48 + y*2304`). The compiler emits
`CellOp` *objects*, full stop.

### 1.2 Read surface (grounding + iteration tools)

```ts
getBlock(x, y, z): BlockId | undefined        // sync, cheap
getStats(): EngineStats                        // sync; cached on main thread
getAllCells(): CellDelta[]                      // bulk — save/load + grounding only
raycast(origin, dir): Promise<RaycastResult>    // async; backed by raycast.worker
getContract(): Contract | null
getLayers(); getActiveLayer(); getChronoEntries()
```

`EngineStats = { cellCount, integrity: 0..1, anomaly: 0..1, chunkCount, memoryBytes }`.

### 1.3 Events (`engine.on(...)`)

`'patch'` (deltas), `'stats'`, `'chrono'`, `'layers'`, `'contract'`, `'ready'`,
`'error'`. Worker wire messages: `APPLY_OPS / UNDO / REDO / JUMP_TO_CHRONO /
CLEAR_ALL / SERIALIZE / layer ops / SET_CONTRACT / TICK_STATS` →
`READY / PATCH / STATS / CHRONO / LAYERS / SERIALIZED_RAW / ERROR`.

`OCCUPANCY_DELTA` is **real**: `voxel.worker` pushes a versioned occupancy buffer
to `raycast.worker` so `engine.raycast()` answers off the main thread. This is the
backbone of any "probe-on-demand" grounding (§4) and of the Anomaly Hunter (§7).

### 1.4 Block vocabulary + scalars (`lib/blocks.ts`)

16 blocks, 5 categories. Each block carries exactly **two** scalars — `stability`
(0–1) and `anomaly` (0–1). There are **no** adjacency/foundation/contact rules.
Integrity = weighted average of `stability` over placed cells.

| BlockId | Category | stability / anomaly |
|---|---|---|
| `obsidian` | structure | 1.0 / 0 |
| `chrome` | structure | 0.95 / 0 |
| `carbon` | structure | 0.92 / 0 |
| `corp-glass` | structure | 0.7 / 0 |
| `neon-cyan` `neon-magenta` `neon-amber` `neon-lime` `neon-violet` | neon | 0.85 / 0 |
| `toxic-core` | energy | 0.55 / 0.3 |
| `power-line` | energy | 0.9 / 0 |
| `data-stream` | data | 0.8 / 0.05 |
| `holo-billboard` | data | 0.75 / 0 |
| `circuit` | data | 0.85 / 0 |
| `neural-node` | data | 0.9 / 0 |
| `glitch` | anomaly | 0.2 / 1.0 |

**Exact IDs matter** — `neon-magenta`, not `magenta`. A wrong ID silently no-ops
in `applyOps`.

### 1.5 Prefab data (`lib/artifacts.ts`, `lib/artifacts/prefabs.ts`)

**20 shipped prefabs.** Real shape:

```ts
interface Artifact {
  id: string; name: string;
  type: 'prefab' | 'blueprint';
  tags?: string[]; thumbnail?: string;     // thumbnail = optional base64
  anchor: [number, number, number];
  cells: ArtifactCell[];                    // { dx, dy, dz, blockId, layer }
  createdAt: number;
}
```

### 1.6 Reuse surface (write none of this from scratch)

| Need | Reuse |
|---|---|
| Rasterize a line | `voxelLine3D` (`lib/brush.ts`) |
| Brush footprint at a point | `brushCells` |
| Multi-segment polyline | `cellsAlongPath` |
| Prefab rotate/mirror | `transformCells` (`lib/artifacts/transform.ts`) |
| Ghost preview render | `components/scene/Cursor.tsx` (already translucent + wireframe) |
| Region selection state | `uiStore` `selectionStart/selectionEnd/clipboard`, `Interaction.tsx` |
| Offline prefab baking | `scripts/extract-prefabs.mjs` |

---

## 2. Ground-truth corrections (what the source research got wrong)

> Keep this table. It is the antidote to re-importing fiction in a later session.

| Research claim | Reality | Verdict |
|---|---|---|
| `I = x + y·W + z·(W·H)` index formula | Engine packs `x + z·48 + y·2304`; agent never indexes — emits `CellOp` objects | **Wrong & irrelevant — ignore** |
| "Delta-Based History": JSON-Patch / RFC-6902 / `FileHistory` / triple-pass diffing / prototype-patching / 3 IndexedDB stores | Worker has `chronoLog` + undo/redo/`jumpToChrono`; saves are OBS2 binary in IndexedDB | **Fiction — build none of it; undo+save are free via `applyOps`** |
| "Stability Matrix": foundations, "chrome can't touch energy", `toxic-core` must be insulated, `neural-node` needs 2 links | Blocks carry only `stability` + `anomaly` scalars; integrity is a weighted average | **Invented physics — descope; feed scalars to the prompt instead (§5)** |
| Dithered alpha-hash fragment shader / additive blend / CPU instance sort / separate staging canvas | `Cursor.tsx` already previews with `MeshBasicMaterial { opacity: 0.18, depthWrite: false }` + wireframe | **Over-built — reuse existing ghost (§6)** |
| Block IDs `magenta`, `amber`, … | Real IDs keep `neon-` prefix | **Would no-op `applyOps` — use exact IDs** |
| Prefab `attachmentPoints` metadata | Not in `Artifact`; presupposes the non-existent floating/foundation physics | **Drop for MVP; optionally auto-derive base footprint only (§3)** |
| WebWorker DSL compiler | Expanding box/line/prefab is sub-ms on main thread via existing sync helpers | **Premature — main thread + op cap** |
| Multi-agent supervisor (Architect/Hunter/Drone) as MVP | Correct north star; heavy for a single-user tool | **Defer — one tool-using agent first (§7, §10)** |
| "Save region" utility lives in `Cursor.tsx` | `Cursor.tsx` only renders the ghost; selection/save live in `uiStore` + `Interaction.tsx` + `ArtifactLibraryPanel.tsx` | **Right idea, wrong file** |

**The recurring tell:** any time the research says *"structural integrity,"
"foundation," "floating," "load-bearing,"* or *"verify stability (as a gate),"*
it is reaching for physics the engine does not have. The only knobs are two
scalars and a weighted average.

---

## 3. The parametric DSL

LLMs hit a **spatial-reasoning ceiling** emitting raw coordinates: token bloat
and cumulative drift. The fix is a small **parametric DSL** the model targets;
a deterministic compiler expands it to `CellOp[]`. This pushes coordinate math
out of the model and into code that can't drift.

### 3.1 Operators (MVP set)

| Op | Schema | Compiles via | Notes |
|---|---|---|---|
| `box` | `min:[x,y,z], size:[w,h,d], block, hollow?` | direct fill / shell | hollow = subtract interior |
| `fill` | `min:[x,y,z], max:[x,y,z], block` | direct | inclusive AABB |
| `line` | `from:[x,y,z], to:[x,y,z], block` | `voxelLine3D` | 3D Bresenham (already shipped) |
| `prefab` | `name, at:[x,y,z], rotate:0\|90\|180\|270` | `transformCells` + offset | **headline op — §3.3** |
| `erase` | `min, max` | direct, `blockId:null` | |
| `window_grid` | `min, size, face, spacing, block` | project 2D grid on a shell face | high misuse risk (face orientation) |
| `scatter` | `region, block, density, seed` | seeded PRNG over volume | seed must be explicit — §3.4 |

`block` accepts **friendly aliases** (`cyan` → `neon-cyan`); the compiler maps to
canonical `BlockId` or rejects. `layer` defaults to the cell's `y`.

### 3.2 Compiler responsibilities (deterministic, main-thread)

1. **Alias → `BlockId`** (reject unknown).
2. **Clamp/discard** to bounds `0 ≤ x,z < 48`, `0 ≤ y < 12`.
3. **Dedup** overlapping cells (last-writer-wins, like `cellsAlongPath`).
4. **Op cap** — hard ceiling per turn (see §11); reject/trim past it.
5. Emit one `CellOp[]` → one `applyOps(ops, "AI: <prompt>")`.

No worker, no index math, no JSON-patch. ~Sub-millisecond for typical builds.

> **Dual sub-language (VLA/VFO) split** from the source research is **rejected for
> MVP** — a single flat op list is simpler and sufficient. Revisit only if energy/
> data routing grows its own grammar.

### 3.3 `prefab` is the headline operator

You already ship **20 authored prefabs**. `prefab(name, at, rotate)` is the
highest **intent-per-token** op available: ~99% token reduction and **zero spatial
drift** (geometry is authored, not generated). Heuristic (guideline, not a gate):
**prefer composition once a sub-structure needs more than a handful of mutations
or several materials** — let the model place prefabs for volumes and stitch them
with simple `line`/`box` connectors.

### 3.4 `scatter` / randomness

Seed must be **model-chosen, surfaced to the user, and stored on the build record**
so a build is reproducible and re-editable. It coexists with "one build = one
chrono entry" because the seed lives in the DSL script, not the engine — re-running
the same script + seed yields identical `CellOp[]`.

---

## 4. Spatial grounding (the highest-leverage open problem)

An agent can't build blind, but dumping `getAllCells()` (3,100+ cells ≈ tens of
thousands of tokens) is impractical. Three tiers, cheapest first:

| Tier | Token cost | Accuracy | Use |
|---|---|---|---|
| **Bbox + stats** | ~150 | macro | zoning, planning, "add a roof on top" |
| **2D ASCII layer slices** | 400–1,200 | per-plane | layout, alignment, detailing |
| **Probe-on-demand** (`getBlock` / `raycast`) | ~50 / call | local | multi-step repair, conflict checks |

**Read/Write ASCII asymmetry (genuinely useful):** models *parse* 2D ASCII grids
well but *generate* them with alignment drift. So the protocol is **read ASCII,
write DSL** — never let the model emit ASCII back.

**Eviction** to keep slices < ~1,200 tokens: drop empty slices entirely; collapse
uniform regions; preserve functional paths (energy/data lines) over bulk
structural backing.

**Default:** start with **bbox + stats**; add a **single top-down heightmap**;
only send per-layer slices when a task demands planar detail. Editing existing
structures (the common case) needs **relative/anchored** DSL placement
("on top of the tagged region") more than absolute coords — an open design item
(§12).

---

## 5. Prefab catalog the model reads (derived, not authored-from-scratch)

The model needs a *textual* catalog (no thumbnails in context). Most of it is
**derived from existing `cells`** by a single helper:

```ts
// describePrefab(a: Artifact) -> CatalogEntry
{
  id: "prefab_arcology_base",          // a.id            (have)
  name: "Arcology Base",               // a.name          (have)
  tags: ["structure","glitch"],        // a.tags          (have)
  dimensions: { w, h, d },             // DERIVED: bbox of a.cells
  blockHistogram: { obsidian: 21, circuit: 2 }, // DERIVED: count a.cells by blockId
  semanticTag: "Cross-hatched obsidian foundation slab with circuit nodes…" // NEW: ~20 authored one-liners
}
```

- `dimensions` + `blockHistogram` → **derive at load** (~20-line helper). The
  histogram lets the model reason with the real `stability`/`anomaly` scalars when
  it picks prefabs.
- `semanticTag` → **net-new but cheap**: 20 hand-written sentences, seeded by
  existing `tags`. High value, low risk.
- `attachmentPoints` → **dropped** (invented; see §2). Optionally auto-derive a
  crude "base footprint = min-`y` cells" — but no authored joint metadata.

**Agent is a strict prefab consumer.** It never gets a `saveRegionAsPrefab` tool
mid-loop (namespace pollution, tool-selection confusion under the turn cap).
"Save Selected Region → Library" is a **separate user-driven UI utility** living
in `uiStore` + `Interaction.tsx` + `ArtifactLibraryPanel.tsx` (reusing the
selection state + `extract-prefabs.mjs` baking path) — **not** in `Cursor.tsx`,
and its only save check is *bounds valid + non-empty + valid IDs* (integrity is a
number you may *show*, not a gate).

---

## 6. Ghost-preview-then-apply (the UX spine)

You don't have to trust the model, because **every build is one undoable chrono
entry labeled `AI: <prompt>`** — worst case is one Ctrl+Z. Better still, you can
review *before* committing, reusing machinery you already shipped:

- `Cursor.tsx` already renders proposed cells as translucent
  `MeshBasicMaterial { opacity: 0.18, depthWrite: false }` + wireframe. The
  `depthWrite: false` *is* the standard cheap fix for transparency sorting — no
  dither shader needed.
- The agent's `CellOp[]` is the **same shape as a stamp**, so: prompt → compile →
  load into the ghost → user inspects/nudges → **Accept** fires `applyOps`,
  **Reject** discards (engine never mutated).

**One real enhancement** for large builds: `Cursor.tsx` decimates past
`VISIBLE_CAP = 64` cells (per-cell `<group>`). For an AI build of thousands of
voxels, swap to a single `InstancedMesh` ghost, or show **massing** (bounding
shells / decimated ghost / wireframe) rather than every cell. ~30 lines, not a
shader.

---

## 7. Three agent archetypes (mapped to the real API)

| Archetype | Reads | Writes | Role |
|---|---|---|---|
| **Architect** (generation) | bbox+stats, ASCII slices, prefab catalog | parametric DSL → `applyOps` | build from a prompt |
| **Anomaly Hunter** (diagnostic, read-only) | `getAllCells` + per-block `anomaly`, `raycast`, `getStats` | nothing (highlights/report) | find unstable/anomalous cells |
| **Repair Drone** (optimization) | `getContract`, current state diff | surgical local DSL patches | fix contract gaps / patch holes |

Anomaly Hunter is pure-read and naturally rides `OCCUPANCY_DELTA` / `raycast`.
Repair Drone is the contract-aware writer. Both are **post-MVP** (§10).

---

## 8. Rendering options for agent output

The build itself renders through the **canonical instancing path** with no special
casing — `applyOps` → worker `PATCH` → `RenderBridge.queueDeltas()` →
`flushPending()`. The only agent-specific rendering is the **preview**:

| Option | Verdict |
|---|---|
| Reuse `Cursor.tsx` per-cell ghost | ✅ MVP (≤ a few hundred cells) |
| Single `InstancedMesh` ghost | ✅ enhancement for large builds |
| Massing / bounding-shell preview | ✅ for thousand-cell builds |
| Dither/alpha-hash shader, additive staging canvas | ❌ over-built (§2) |

If agents later become **visible entities** (avatars/drones moving in-scene),
that's a separate concern — an `InstancedMesh` on an unused upper layer or ECS
sprites — explicitly out of scope for "agent builds voxels."

---

## 9. System architecture

```
User prompt
   │
   ▼
app/api/voxel-agent/route.ts        ── server-side; Anthropic key never on client
   │  Anthropic tool-use, forced `emit_build` schema (the DSL)
   │  system prompt = world card (48×12×48, 16-block glossary + scalars,
   │                  prefab catalog, bbox+stats grounding)
   ▼
DSL script  ──▶  compileDSL()  ──▶  CellOp[]      (client, deterministic, §3.2)
   │                                   │
   │                                   ▼
   │                            Ghost preview (reuse Cursor path, §6)
   │                                   │  Accept
   ▼                                   ▼
(optional read tools:            getEngine().applyOps(ops, "AI: <prompt>")
 getBlock/raycast/getStats)            │
                                       ▼
                              free: undo · effects · persistence
```

- **Server route** keeps the key off the client and the WebGL thread clear.
- **Tool-use with a forced schema** gives structured output without brittle JSON
  parsing.
- **Model choice:** `claude-sonnet-4-6` default (interactive latency);
  `claude-opus-4-8` for complex builds / the agentic loop. *(Confirm exact request
  shape against the `claude-api` skill at implementation time.)*
- **Single-turn first.** The read→build→inspect loop (§10) is an additive phase,
  not a rewrite.

---

## 10. Single-turn vs. the agentic loop

Your read API (`getBlock`, `raycast`, `getStats`, `getAllCells`) is exactly the
toolset for **build → inspect → adjust**. But each turn is a full round-trip
(1.2–3.5 s), so:

- **Ship single-turn first** — ~80% of value, the plan's recommended Wave E MVP.
- **Turn cap = 3**; hard op cap per turn (§11). A loop that keeps "fixing" is a
  real failure mode.
- A **cheap deterministic post-compile validator** (bounds, op cap, optional
  integrity delta) is usually strictly better than spending a turn on LLM
  self-check.
- **Multi-agent (Architect/Hunter/Drone) is likely over-built for a single-user
  creative tool.** One tool-using agent with read+write tools probably gets ~90%
  at a fraction of the orchestration cost. Justify multi-agent only with evidence
  (e.g. measured quality lift on diagnostic/repair tasks).

---

## 11. Integration risks & performance budgets

| Risk | Mitigation |
|---|---|
| Main-thread hitch on huge `applyOps` | Op cap per turn; chunk very large builds; commit batched (one `applyOps`) to minimize GPU buffer re-uploads |
| Particle storm on edit feedback | Existing **≤ 360 particle** budget; dense AI builds skip per-cell FX or apply quietly |
| Runaway loop | **3-turn cap**, terminate on no-progress |
| Undo granularity | One build = one labeled chrono entry (`AI:` prefix); never split mid-build |
| `getAllCells()` cost | Grounding uses bbox+stats / slices, **not** raw dumps; `getAllCells` stays save/load-only per hard constraint #7 |
| Contract conflicts | Architect may ignore an active `Contract`; Repair Drone (post-MVP) reconciles |
| User vs. agent edit races | Ghost-then-apply serializes intent through the user's Accept |
| API key exposure | Server route only; key in env / Vercel dashboard, never client |
| Next.js 14 only | No Next 15 / R3F v9 (hard constraint #8) |

---

## 12. Open research frontiers

History, persistence, diffing, and render-staging are **solved or reusable** —
stop spending design effort there. The genuine risk lives in two places:

**A. Spatial grounding representation**
1. `y` is height (0–11) but `x/z` span 0–47 — does **named-axis** framing
   (east/up/north) beat raw `x/y/z` for reducing axis-swap errors?
2. Is the read-easy/write-hard ASCII asymmetry real at 48-wide for current Claude
   models? At what width does *read* accuracy drift? Do fixed-width gutters help?
3. Default grounding: top-down heightmap vs. N layer slices vs. bbox+stats — and
   where does each break by scene complexity?
4. How many slices before token cost outweighs accuracy at a 1.2–3.5 s target?
5. What grounding + DSL ops best support **relative/anchored** placement
   ("on top of the existing tower") vs. absolute coords? (Editing > greenfield.)

**B. DSL expressiveness vs. reliability**
6. Which ops give the most intent-per-token, and which do models systematically
   misuse (`hollow` off-by-one, `window_grid` face orientation, `bridge` axis
   confusion)? What minimal op set covers ~80% of build intents?
7. `scatter` seed: model-chosen + user-visible + stored — reconciled with "one
   build = one chrono entry" (§3.4).
8. Validation: lean on the scalar integrity metric, or add a *minimal* support
   ruleset? If the latter, what's the smallest rule set that adds value without
   becoming a physics engine — and how do you keep **one source of truth** shared
   by the compiler validator and the LLM glossary?
9. Prefab catalog without thumbnails: name + bbox + histogram + one-line tag —
   sufficient? When does "compose 3 prefabs + connectors" beat primitive
   generation? Should the model ever *propose* new prefabs (vs. strict consume)?

---

## 13. Recommended Wave E MVP

Smallest shippable slice — natural language → reviewed voxels, with undo,
persistence, and effects all inherited:

1. **`lib/agent/dsl.ts`** — DSL types + `compileDSL(ops) → CellOp[]` reusing
   `voxelLine3D` / `brushCells` / `transformCells`; clamp, alias-map, dedup,
   op-cap.
2. **`lib/agent/catalog.ts`** — `describePrefab(Artifact)` → derived
   dimensions + histogram + authored sentence.
3. **`app/api/voxel-agent/route.ts`** — Anthropic tool-use, forced `emit_build`
   schema, world-card system prompt, `claude-sonnet-4-6`.
4. **UI** — a prompt box → call route → `compileDSL` → existing ghost path →
   **Accept** fires `applyOps(ops, "AI: <prompt>")`. One `uiStore` flag; no
   engine changes.

**Explicitly deferred:** agentic loop, Anomaly Hunter, Repair Drone, multi-agent
orchestration, `InstancedMesh` massing preview, any structural-physics ruleset,
"save region as prefab" automation.

---

*Spike C deliverable. Aligned with [how-to-extend.md](how-to-extend.md) hard
constraints. No code shipped — this is the plan for Wave E.*
</content>
</invoke>
