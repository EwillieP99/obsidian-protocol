// 16³ voxel chunk. The worker holds a sparse Map<chunkKey, Chunk>.
//
// Cell encoding (16 bits per cell):
//   low byte  (0xFF)   = block index (0..255). 0 = air / empty.
//   high byte (0xFF00) = layer index (0..255). Layer is stored per-cell so the
//                         worker can compute opacity / visibility masks without
//                         re-deriving it from y.
//
// Index layout inside the flat array:
//   idx = (y_local << 8) | (z_local << 4) | x_local   for CHUNK_SIZE=16

import { CHUNK_VOLUME } from '@/lib/constants';

export class Chunk {
  /** Flat (Uint16Array[CHUNK_VOLUME]) — 8192 bytes per chunk. */
  readonly data: Uint16Array;

  /**
   * Cache: how many non-air cells live in this chunk. Maintained by the
   * worker on every write. Lets us skip empty chunks during enumeration and
   * eviction without scanning all 4096 cells.
   */
  count = 0;

  /** Set true when a write happens; RenderBridge / serializer consume + clear. */
  dirty = false;

  /** performance.now() of the last write — drives LRU eviction in ChunkManager. */
  lastWrite = 0;

  constructor(seed?: Uint16Array) {
    if (seed) {
      if (seed.length !== CHUNK_VOLUME) {
        throw new Error(
          `Chunk seed length ${seed.length} != CHUNK_VOLUME ${CHUNK_VOLUME}`,
        );
      }
      this.data = seed;
      // Recount non-air cells.
      let n = 0;
      for (let i = 0; i < CHUNK_VOLUME; i++) if ((seed[i] & 0xff) !== 0) n++;
      this.count = n;
    } else {
      this.data = new Uint16Array(CHUNK_VOLUME);
    }
  }

  /** Reset the chunk to all-air without reallocating. */
  clear(): void {
    this.data.fill(0);
    this.count = 0;
    this.dirty = true;
    this.lastWrite = performance.now();
  }

  /** True if no non-air cell remains. */
  isEmpty(): boolean {
    return this.count === 0;
  }
}

// ---------------------------------------------------------------------------
// Cell pack / unpack helpers — keep these inline-hot for the worker loops.
// ---------------------------------------------------------------------------

export function packCell(blockIndex: number, layer: number): number {
  // Caller is responsible for valid ranges (0..255 each). Worker validates
  // before calling; we skip the mask here so V8 inlines aggressively.
  return ((layer & 0xff) << 8) | (blockIndex & 0xff);
}

export function unpackBlock(cell: number): number {
  return cell & 0xff;
}

export function unpackLayer(cell: number): number {
  return (cell >> 8) & 0xff;
}
