// All worker message types as discriminated unions. This is the single
// compile-time contract between the main thread and the three workers
// (voxel, raycast, compress) and between the workers themselves over
// MessageChannel.
//
// Conventions:
//   * `type` is the discriminant on every message.
//   * Numeric block indices (BlockIndex) cross the wire, not BlockId strings.
//     VoxelEngine translates BlockIndex <-> BlockId at the API boundary.
//   * Large payloads (chunk Uint16Arrays, OBS2 buffers, delta packs) move as
//     transferable ArrayBuffers — zero-copy ownership transfer. No
//     SharedArrayBuffer, no COOP/COEP headers required.

import type { Contract } from '@/types';
import type { ChronoEntry, EngineStats, LayerMeta } from '@/types/engine';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Compact numeric block id used on the wire. 0 = air. 1..255 = palette slot. */
export type BlockIndex = number;

/**
 * One cell change as emitted by voxel.worker after every mutation. The
 * RenderBridge maps blockIndex -> InstancedMesh slot; the effects hook reads
 * the same record to spawn particles / audio / shake.
 */
export interface WireDelta {
  cellIdx: number; // global linear index
  x: number;
  y: number;
  z: number;
  prevBlock: BlockIndex;
  newBlock: BlockIndex;
  layer: number;
  opacity: number;
}

/**
 * One chunk's raw payload as it crosses worker boundaries during serialize
 * / deserialize. `data` is a transferable Uint16Array buffer (8192 bytes per
 * 16³ chunk); after transfer, the sender's view is detached.
 */
export interface ChunkExport {
  cx: number;
  cy: number;
  cz: number;
  data: ArrayBuffer; // backing buffer of Uint16Array[CHUNK_VOLUME]
}

/**
 * Occupancy delta pushed from voxel.worker to raycast.worker over their
 * dedicated MessageChannel. The buffer holds packed (cellIdx, blockIndex) pairs.
 *
 * Layout: Uint32Array view of `buffer`. Even indices = cellIdx (from
 * `cellLinearIdx(x,y,z)`), odd indices = the new BlockIndex at that cell
 * (0 = cleared / air, non-zero = the block now present). Length is always even.
 *
 * The raycast worker uses the blockIndex both as occupancy (any non-zero =
 * solid) and as the value to return in `WireRayHit.blockIndex` on hit.
 */
export interface OccupancyDelta {
  version: number; // monotonic; raycast worker drops stale messages
  buffer: ArrayBuffer; // transferable
}

// ---------------------------------------------------------------------------
// Main thread -> voxel.worker
// ---------------------------------------------------------------------------

export type MainToVoxelMsg =
  | {
      type: 'INIT';
      worldX: number;
      worldY: number;
      worldZ: number;
      chunkSize: number;
      historyLimit: number;
      layers: LayerMeta[];
      activeLayer: number;
      blockTable: BlockTableEntry[]; // index 0 reserved for air
      seedCells?: WireOp[]; // initial cells to populate (V1 import path)
      contract: import('@/types').Contract | null;
      raycastPort?: MessagePort; // Phase 4 wire-up
      compressPort?: MessagePort; // Phase 5 wire-up
      statsTickMs: number;
    }
  | { type: 'APPLY_OPS'; ops: WireOp[]; label: string; requestId?: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'JUMP_TO_CHRONO'; entryId: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'SERIALIZE'; requestId: number; name: string; thumbnail?: string }
  | { type: 'LOADED_CHUNKS'; chunks: ChunkExport[]; layers: LayerMeta[]; contract: Contract | null }
  | { type: 'SET_ACTIVE_LAYER'; id: number }
  | { type: 'SET_LAYER_VISIBILITY'; id: number; visible: boolean }
  | { type: 'SET_LAYER_LOCK'; id: number; locked: boolean }
  | { type: 'SET_LAYER_SOLO'; id: number; solo: boolean }
  | { type: 'SET_LAYER_OPACITY'; id: number; opacity: number }
  | { type: 'MOVE_LAYER'; from: number; to: number }
  | { type: 'RENAME_LAYER'; id: number; name: string }
  | { type: 'SET_CONTRACT'; contract: Contract | null }
  | { type: 'TICK_STATS' }
  | { type: 'DISPOSE' };

/** A CellOp encoded for the wire. blockIndex 0 = erase. */
export interface WireOp {
  x: number;
  y: number;
  z: number;
  blockIndex: BlockIndex;
  layer: number;
}

/**
 * Per-block metadata the worker needs in order to compute integrity / anomaly
 * and bake instance opacity into the WireDelta. Sent at INIT time.
 */
export interface BlockTableEntry {
  blockId: string; // BlockId — kept as string at the wire to avoid type loop
  stability: number; // 0..1
  anomaly: number; // 0..1
  opacity: number; // 0..1 — block's intrinsic opacity (1 unless transparent)
}

// ---------------------------------------------------------------------------
// voxel.worker -> main thread
// ---------------------------------------------------------------------------

export type VoxelToMainMsg =
  | { type: 'READY' }
  | { type: 'PATCH'; deltas: WireDelta[]; label: string; requestId?: number }
  | { type: 'STATS'; stats: EngineStats }
  | { type: 'CHRONO'; entries: ChronoEntry[]; futureEntries: ChronoEntry[] }
  | { type: 'LAYERS'; layers: LayerMeta[]; activeLayer: number }
  | {
      type: 'SERIALIZED_RAW';
      requestId: number;
      chunks: ChunkExport[];
      layers: LayerMeta[];
      contract: Contract | null;
      name: string;
      thumbnail?: string;
      cellCount: number;
    }
  | { type: 'ERROR'; message: string };

// ---------------------------------------------------------------------------
// Main thread -> raycast.worker
// ---------------------------------------------------------------------------

export type MainToRaycastMsg =
  | {
      type: 'INIT';
      worldX: number;
      worldY: number;
      worldZ: number;
      voxelPort: MessagePort;
    }
  | {
      type: 'RAY_QUERY';
      requestId: number;
      origin: [number, number, number];
      direction: [number, number, number];
      maxSteps?: number;
    }
  | { type: 'DISPOSE' };

// ---------------------------------------------------------------------------
// raycast.worker -> main thread
// ---------------------------------------------------------------------------

export type RaycastToMainMsg =
  | { type: 'READY' }
  | {
      type: 'RAY_RESULT';
      requestId: number;
      hit: WireRayHit | null;
    }
  | { type: 'ERROR'; message: string };

export interface WireRayHit {
  cell: [number, number, number];
  face: [number, number, number];
  blockIndex: BlockIndex;
  isAdjacentFace: boolean;
}

// ---------------------------------------------------------------------------
// voxel.worker <-> raycast.worker (over MessageChannel)
// ---------------------------------------------------------------------------

export type VoxelToRaycastMsg = { type: 'OCCUPANCY_DELTA'; delta: OccupancyDelta };

// raycast.worker has no reason to talk back to voxel.worker today, but a
// type stub keeps the channel symmetric.
export type RaycastToVoxelMsg = never;

// ---------------------------------------------------------------------------
// Main thread -> compress.worker  (and voxel.worker -> compress.worker)
// ---------------------------------------------------------------------------

export type MainToCompressMsg =
  | { type: 'INIT'; voxelPort: MessagePort }
  | {
      type: 'ENCODE';
      requestId: number;
      chunks: ChunkExport[];
      layers: LayerMeta[];
      contract: Contract | null;
      name: string;
      thumbnail?: string;
      cellCount: number;
    }
  | { type: 'DECODE'; requestId: number; buffer: ArrayBuffer }
  | { type: 'DISPOSE' };

// ---------------------------------------------------------------------------
// compress.worker -> main thread
// ---------------------------------------------------------------------------

export type CompressToMainMsg =
  | { type: 'READY' }
  | { type: 'ENCODED'; requestId: number; buffer: ArrayBuffer }
  | {
      type: 'DECODED';
      requestId: number;
      chunks: ChunkExport[];
      layers: LayerMeta[];
      contract: Contract | null;
      name: string;
      thumbnail?: string;
    }
  | { type: 'ERROR'; requestId?: number; message: string };

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export type AnyMainOut = MainToVoxelMsg | MainToRaycastMsg | MainToCompressMsg;
export type AnyMainIn = VoxelToMainMsg | RaycastToMainMsg | CompressToMainMsg;

/**
 * Narrow an inbound worker message by its `type` discriminant. Useful in
 * onmessage handlers: `if (msg.type === 'PATCH') { /* msg is PATCH variant *\/ }`.
 */
export type Extract<M extends { type: string }, T extends M['type']> = M extends { type: T }
  ? M
  : never;
