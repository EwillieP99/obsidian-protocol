// voxel.worker.ts — V2 engine core. Owns canonical voxel state off the main
// thread. Receives mutation messages from VoxelEngine and emits typed PATCH /
// STATS / CHRONO / LAYERS replies.
//
// Black-box rule: this file may import from `@/lib/*`, `@/types/*` and
// `@/engine/...` (which are pure TypeScript). It must NOT import React,
// Zustand, Three.js, or any 'use client'-tagged module.

/// <reference lib="webworker" />

import type { BlockId, Contract } from '@/types';
import type { ChronoEntry, EngineStats, LayerMeta } from '@/types/engine';
import type {
  BlockTableEntry,
  MainToVoxelMsg,
  VoxelToMainMsg,
  WireDelta,
  WireOp,
} from '@/engine/bridge/WorkerProtocol';
import { Chunk, packCell, unpackBlock, unpackLayer } from '@/engine/chunks/Chunk';
import { CHUNK_VOLUME, ENGINE_CHRONO_LIMIT } from '@/lib/constants';
import { cellLinearIdx, chunkKey, localIdx } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** One undo/redo step: a flat list of cell changes with packed before/after. */
interface WorkerPatchEntry {
  id: string;
  label: string;
  timestamp: number;
  ops: WorkerPatchOp[];
}

interface WorkerPatchOp {
  x: number;
  y: number;
  z: number;
  prevCell: number; // packed uint16
  nextCell: number; // packed uint16
}

// ---------------------------------------------------------------------------
// State (worker-singleton; one worker per VoxelEngine)
// ---------------------------------------------------------------------------

let chunks: Map<string, Chunk> = new Map();
let layers: LayerMeta[] = [];
let activeLayer = 0;
let chronoLog: WorkerPatchEntry[] = [];
let future: WorkerPatchEntry[] = [];
let blockTable: BlockTableEntry[] = [];
let contract: Contract | null = null;
let historyLimit = ENGINE_CHRONO_LIMIT;
let statsTickMs = 200;
let statsTimer: ReturnType<typeof setInterval> | null = null;

// Phase 4 — raycast wiring. `raycastPort` is the MessagePort half-given to us
// at INIT; we use it to push (cellIdx, blockIndex) occupancy deltas. The
// version counter is monotonic so the raycast worker can drop stale messages.
let raycastPort: MessagePort | null = null;
let occupancyVersion = 0;
// Per-mutation accumulator: pairs of (cellIdx, blockIndex). Reset after flush.
let pendingOccupancy: Array<[number, number]> = [];

// Incremental stats counters — kept in sync on every cell write. Stats
// emission is O(1) regardless of world size.
let cellCount = 0;
let sumStability = 0;
let sumAnomaly = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextId(): string {
  // Worker has no shared crypto module in older browsers; this is enough for
  // chrono-entry uniqueness within one session.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function getCellAt(x: number, y: number, z: number): number {
  const ck = chunkKey(x, y, z);
  const chunk = chunks.get(ck);
  if (!chunk) return 0;
  return chunk.data[localIdx(x, y, z)];
}

/**
 * Write `value` (packed uint16) into the cell at (x,y,z). Maintains the
 * chunk's `count` and the global incremental stats counters. Allocates a
 * chunk on demand. Returns the previous packed cell value.
 *
 * Caller is responsible for bounds-checking — the worker trusts that
 * VoxelEngine only sends in-world coords.
 */
function setCellAt(x: number, y: number, z: number, value: number): number {
  const ck = chunkKey(x, y, z);
  let chunk = chunks.get(ck);
  if (!chunk) {
    if (value === 0) return 0; // writing air to an absent chunk = no-op
    chunk = new Chunk();
    chunks.set(ck, chunk);
  }
  const li = localIdx(x, y, z);
  const prev = chunk.data[li];
  if (prev === value) return prev;

  chunk.data[li] = value;
  chunk.dirty = true;
  chunk.lastWrite = performance.now();

  // Maintain per-chunk count.
  const prevBlock = unpackBlock(prev);
  const nextBlock = unpackBlock(value);
  if (prevBlock !== 0 && nextBlock === 0) chunk.count--;
  else if (prevBlock === 0 && nextBlock !== 0) chunk.count++;

  // Maintain global stats counters.
  if (prevBlock !== 0) {
    cellCount--;
    sumStability -= blockTable[prevBlock]?.stability ?? 0;
    sumAnomaly -= blockTable[prevBlock]?.anomaly ?? 0;
  }
  if (nextBlock !== 0) {
    cellCount++;
    sumStability += blockTable[nextBlock]?.stability ?? 0;
    sumAnomaly += blockTable[nextBlock]?.anomaly ?? 0;
  }

  // Phase 4 — accumulate (cellIdx, blockIndex) for the raycast worker. The
  // mutation handler flushes once per call so a single brush stroke produces
  // one transferable buffer.
  if (raycastPort && prevBlock !== nextBlock) {
    pendingOccupancy.push([cellLinearIdx(x, y, z), nextBlock]);
  }

  return prev;
}

/**
 * Drain `pendingOccupancy` and post one OCCUPANCY_DELTA to the raycast worker.
 * Buffer is transferred (zero-copy); subsequent flushes allocate fresh.
 */
function flushOccupancy(): void {
  if (!raycastPort || pendingOccupancy.length === 0) return;
  const buf = new ArrayBuffer(pendingOccupancy.length * 2 * 4);
  const view = new Uint32Array(buf);
  for (let i = 0; i < pendingOccupancy.length; i++) {
    const [idx, blk] = pendingOccupancy[i];
    view[i * 2] = idx;
    view[i * 2 + 1] = blk;
  }
  pendingOccupancy = [];
  occupancyVersion++;
  raycastPort.postMessage(
    { type: 'OCCUPANCY_DELTA', delta: { version: occupancyVersion, buffer: buf } },
    [buf],
  );
}

function computeStats(): EngineStats {
  if (cellCount === 0) {
    return {
      cellCount: 0,
      integrity: 1,
      anomaly: 0,
      chunkCount: chunks.size,
      memoryBytes: chunks.size * CHUNK_VOLUME * 2,
    };
  }
  const stability = sumStability / cellCount;
  const anomalyPressure = Math.min(1, sumAnomaly / Math.max(8, cellCount * 0.25));
  const integrity = Math.max(0, Math.min(1, stability * (1 - anomalyPressure * 0.7)));
  const anomaly = Math.min(1, sumAnomaly / Math.max(1, cellCount));
  // Memory: chunk data + chronoLog footprint (rough — ~24 bytes per op).
  let chronoBytes = 0;
  for (const e of chronoLog) chronoBytes += 32 + e.ops.length * 24;
  for (const e of future) chronoBytes += 32 + e.ops.length * 24;
  return {
    cellCount,
    integrity,
    anomaly,
    chunkCount: chunks.size,
    memoryBytes: chunks.size * CHUNK_VOLUME * 2 + chronoBytes,
  };
}

function chronoEntriesView(): ChronoEntry[] {
  return chronoLog.map((e) => ({
    id: e.id,
    label: e.label,
    timestamp: e.timestamp,
    opCount: e.ops.length,
  }));
}

/** Compute baked opacity for a (blockIndex, layer) pair using current state. */
function bakedOpacity(blockIndex: number, layerId: number): number {
  if (blockIndex === 0) return 0;
  const blockOpacity = blockTable[blockIndex]?.opacity ?? 1;
  const layer = layers.find((l) => l.id === layerId);
  const layerOpacity = layer?.opacity ?? 1;
  return Math.max(0, Math.min(1, blockOpacity * layerOpacity));
}

function isLayerEditable(layerId: number): boolean {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return false;
  if (layer.locked) return false;
  const solo = layers.find((l) => l.solo);
  if (solo && solo.id !== layerId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

function send(msg: VoxelToMainMsg, transfer: Transferable[] = []): void {
  // `postMessage` on a DedicatedWorkerGlobalScope accepts transferables as the
  // second arg.
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

function emitStats(): void {
  send({ type: 'STATS', stats: computeStats() });
}

function emitLayers(): void {
  send({ type: 'LAYERS', layers: [...layers], activeLayer });
}

function emitChrono(): void {
  send({
    type: 'CHRONO',
    entries: chronoEntriesView(),
    futureEntries: future.map((e) => ({
      id: e.id,
      label: e.label,
      timestamp: e.timestamp,
      opCount: e.ops.length,
    })),
  });
}

// ---------------------------------------------------------------------------
// Mutation handlers
// ---------------------------------------------------------------------------

function handleApplyOps(ops: WireOp[], label: string, requestId?: number): void {
  if (ops.length === 0) return;
  const deltas: WireDelta[] = [];
  const patchOps: WorkerPatchOp[] = [];

  for (const op of ops) {
    if (!isLayerEditable(op.layer)) continue;

    const prev = getCellAt(op.x, op.y, op.z);
    const next = op.blockIndex === 0 ? 0 : packCell(op.blockIndex, op.layer);
    if (next === prev) continue;

    setCellAt(op.x, op.y, op.z, next);
    patchOps.push({ x: op.x, y: op.y, z: op.z, prevCell: prev, nextCell: next });

    const prevBlock = unpackBlock(prev);
    const prevLayer = prevBlock === 0 ? op.layer : unpackLayer(prev);
    deltas.push({
      cellIdx: cellLinearIdx(op.x, op.y, op.z),
      x: op.x,
      y: op.y,
      z: op.z,
      prevBlock,
      newBlock: op.blockIndex,
      layer: op.blockIndex === 0 ? prevLayer : op.layer,
      opacity: bakedOpacity(op.blockIndex, op.layer),
    });
  }

  if (patchOps.length === 0) return;

  const entry: WorkerPatchEntry = {
    id: nextId(),
    label,
    timestamp: Date.now(),
    ops: patchOps,
  };
  chronoLog.push(entry);
  if (chronoLog.length > historyLimit) chronoLog.shift();
  future = [];

  send({ type: 'PATCH', deltas, label, requestId });
  flushOccupancy();
  emitChrono();
  emitStats();
}

function applyWorkerPatchOps(entry: WorkerPatchEntry, direction: 'forward' | 'inverse'): WireDelta[] {
  const deltas: WireDelta[] = [];
  const opsList = direction === 'forward' ? entry.ops : [...entry.ops].reverse();

  for (const op of opsList) {
    const target = direction === 'forward' ? op.nextCell : op.prevCell;
    const source = direction === 'forward' ? op.prevCell : op.nextCell;
    setCellAt(op.x, op.y, op.z, target);

    const prevBlock = unpackBlock(source);
    const nextBlock = unpackBlock(target);
    const prevLayer = prevBlock === 0 ? unpackLayer(target) : unpackLayer(source);
    const nextLayer = nextBlock === 0 ? prevLayer : unpackLayer(target);
    deltas.push({
      cellIdx: cellLinearIdx(op.x, op.y, op.z),
      x: op.x,
      y: op.y,
      z: op.z,
      prevBlock,
      newBlock: nextBlock,
      layer: nextLayer,
      opacity: nextBlock === 0 ? 0 : bakedOpacity(nextBlock, nextLayer),
    });
  }
  return deltas;
}

function handleUndo(): void {
  const entry = chronoLog.pop();
  if (!entry) return;
  const deltas = applyWorkerPatchOps(entry, 'inverse');
  future.push(entry);
  send({ type: 'PATCH', deltas, label: `Undo: ${entry.label}` });
  flushOccupancy();
  emitChrono();
  emitStats();
}

function handleRedo(): void {
  const entry = future.pop();
  if (!entry) return;
  const deltas = applyWorkerPatchOps(entry, 'forward');
  chronoLog.push(entry);
  send({ type: 'PATCH', deltas, label: `Redo: ${entry.label}` });
  flushOccupancy();
  emitChrono();
  emitStats();
}

function handleJumpToChrono(entryId: string): void {
  const idx = chronoLog.findIndex((e) => e.id === entryId);
  if (idx === -1) return;
  // Walk back, emitting one inverse-patch per step.
  const stepsBack = chronoLog.length - 1 - idx;
  for (let i = 0; i < stepsBack; i++) handleUndo();
}

function handleClearAll(): void {
  if (cellCount === 0) return;
  const ops: WorkerPatchOp[] = [];
  const deltas: WireDelta[] = [];

  // Walk every chunk by its stored key so we can decode world coords from
  // (chunkCoord, localIdx) without a separate Map.
  for (const [ckey, chunk] of chunks) {
    if (chunk.count === 0) continue;
    const [cxs, cys, czs] = ckey.split(',');
    const cx = parseInt(cxs, 10);
    const cy = parseInt(cys, 10);
    const cz = parseInt(czs, 10);
    for (let li = 0; li < CHUNK_VOLUME; li++) {
      const v = chunk.data[li];
      if (v === 0) continue;
      const lx = li & 0xf;
      const lz = (li >> 4) & 0xf;
      const ly = (li >> 8) & 0xf;
      const x = cx * 16 + lx;
      const y = cy * 16 + ly;
      const z = cz * 16 + lz;
      ops.push({ x, y, z, prevCell: v, nextCell: 0 });
      deltas.push({
        cellIdx: cellLinearIdx(x, y, z),
        x,
        y,
        z,
        prevBlock: unpackBlock(v),
        newBlock: 0,
        layer: unpackLayer(v),
        opacity: 0,
      });
    }
  }
  if (ops.length === 0) return;

  // Apply via setCellAt so counters update consistently. (Direct
  // `chunk.data[li] = 0` would skip the chunk.count / cellCount maintenance.)
  for (const o of ops) setCellAt(o.x, o.y, o.z, 0);

  const entry: WorkerPatchEntry = {
    id: nextId(),
    label: 'Purge Vault',
    timestamp: Date.now(),
    ops,
  };
  chronoLog.push(entry);
  if (chronoLog.length > historyLimit) chronoLog.shift();
  future = [];

  send({ type: 'PATCH', deltas, label: 'Purge Vault' });
  flushOccupancy();
  emitChrono();
  emitStats();
}

// ---------------------------------------------------------------------------
// Layer handlers
// ---------------------------------------------------------------------------

function handleSetActiveLayer(id: number): void {
  if (activeLayer === id) return;
  activeLayer = id;
  emitLayers();
}

function handleSetLayerVisibility(id: number, visible: boolean): void {
  const i = layers.findIndex((l) => l.id === id);
  if (i === -1 || layers[i].visible === visible) return;
  layers = layers.map((l, ix) => (ix === i ? { ...l, visible } : l));
  emitLayers();
}

function handleSetLayerLock(id: number, locked: boolean): void {
  const i = layers.findIndex((l) => l.id === id);
  if (i === -1 || layers[i].locked === locked) return;
  layers = layers.map((l, ix) => (ix === i ? { ...l, locked } : l));
  emitLayers();
}

function handleSetLayerSolo(id: number, solo: boolean): void {
  // V1 semantics: only one layer may be solo at a time. Setting solo on one
  // layer implicitly clears it on all others.
  layers = layers.map((l) => ({ ...l, solo: l.id === id ? solo : false }));
  emitLayers();
}

function handleSetLayerOpacity(id: number, opacity: number): void {
  const clamped = Math.max(0, Math.min(1, opacity));
  const i = layers.findIndex((l) => l.id === id);
  if (i === -1 || layers[i].opacity === clamped) return;
  layers = layers.map((l, ix) => (ix === i ? { ...l, opacity: clamped } : l));
  emitLayers();
}

function handleMoveLayer(from: number, to: number): void {
  // `from` / `to` are display-order indices, not layer ids. V1 stores order
  // as a per-layer field; we replicate that scheme here.
  const ordered = [...layers].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
  if (from < 0 || from >= ordered.length || to < 0 || to >= ordered.length || from === to) return;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const orderById = new Map<number, number>();
  ordered.forEach((l, idx) => orderById.set(l.id, idx));
  layers = layers.map((l) => ({ ...l, order: orderById.get(l.id) ?? l.order }));
  emitLayers();
}

function handleRenameLayer(id: number, name: string): void {
  const i = layers.findIndex((l) => l.id === id);
  if (i === -1) return;
  layers = layers.map((l, ix) => (ix === i ? { ...l, name } : l));
  emitLayers();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function handleInit(msg: Extract<MainToVoxelMsg, { type: 'INIT' }>): void {
  // INIT always (re-)seeds the worker — engine.loadSave() relies on this
  // to swap state without spawning a fresh worker process.
  layers = msg.layers.map((l) => ({ ...l }));
  activeLayer = msg.activeLayer;
  blockTable = msg.blockTable;
  contract = msg.contract;
  historyLimit = msg.historyLimit;
  statsTickMs = msg.statsTickMs;

  chunks = new Map();
  chronoLog = [];
  future = [];
  cellCount = 0;
  sumStability = 0;
  sumAnomaly = 0;

  // Phase 4 — adopt the raycast MessagePort if the engine handed one over.
  // Re-INIT (loadSave path) closes the previous port so the new channel owns
  // the conversation. Version resets so the snapshot below is the freshest.
  if (msg.raycastPort) {
    if (raycastPort) raycastPort.close();
    raycastPort = msg.raycastPort;
  }
  occupancyVersion = 0;
  pendingOccupancy = [];

  // Seed cells from V1 voxelStore snapshot. These are written without
  // pushing a chrono entry — they represent the pre-existing world state.
  // setCellAt will collect occupancy pairs into pendingOccupancy as it goes.
  if (msg.seedCells && msg.seedCells.length > 0) {
    for (const op of msg.seedCells) {
      const value = packCell(op.blockIndex, op.layer);
      setCellAt(op.x, op.y, op.z, value);
    }
  }
  // Flush the seed snapshot before announcing READY so the raycast worker
  // is queried-against an initialized occupancy buffer.
  flushOccupancy();

  // Start (or restart) stats ticker.
  if (statsTimer !== null) clearInterval(statsTimer);
  statsTimer = setInterval(emitStats, statsTickMs);

  send({ type: 'READY' });
  emitLayers();
  emitChrono();
  emitStats();
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

self.onmessage = (ev: MessageEvent<MainToVoxelMsg>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'INIT':
        handleInit(msg);
        break;
      case 'APPLY_OPS':
        handleApplyOps(msg.ops, msg.label, msg.requestId);
        break;
      case 'UNDO':
        handleUndo();
        break;
      case 'REDO':
        handleRedo();
        break;
      case 'JUMP_TO_CHRONO':
        handleJumpToChrono(msg.entryId);
        break;
      case 'CLEAR_ALL':
        handleClearAll();
        break;
      case 'SET_ACTIVE_LAYER':
        handleSetActiveLayer(msg.id);
        break;
      case 'SET_LAYER_VISIBILITY':
        handleSetLayerVisibility(msg.id, msg.visible);
        break;
      case 'SET_LAYER_LOCK':
        handleSetLayerLock(msg.id, msg.locked);
        break;
      case 'SET_LAYER_SOLO':
        handleSetLayerSolo(msg.id, msg.solo);
        break;
      case 'SET_LAYER_OPACITY':
        handleSetLayerOpacity(msg.id, msg.opacity);
        break;
      case 'MOVE_LAYER':
        handleMoveLayer(msg.from, msg.to);
        break;
      case 'RENAME_LAYER':
        handleRenameLayer(msg.id, msg.name);
        break;
      case 'SET_CONTRACT':
        contract = msg.contract;
        break;
      case 'TICK_STATS':
        emitStats();
        break;
      case 'SERIALIZE':
        // Phase 5: route to compress.worker via MessageChannel. For this slice
        // we silently no-op so the engine's serialize() path falls back to
        // V1 JSON in VoxelEngine.
        break;
      case 'LOADED_CHUNKS':
        // Phase 5: incoming decoded chunks. No-op for this slice.
        break;
      case 'DISPOSE':
        if (statsTimer !== null) {
          clearInterval(statsTimer);
          statsTimer = null;
        }
        if (raycastPort) {
          raycastPort.close();
          raycastPort = null;
        }
        pendingOccupancy = [];
        chunks.clear();
        chronoLog = [];
        future = [];
        break;
      default: {
        // Exhaustiveness check — switch over discriminated union.
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'ERROR', message });
  }
};

// `contract` and `BlockId` are referenced via the message-handler closure /
// types; keep them in scope. `cellLinearIdx` is used in delta emission paths
// above.
export {};
