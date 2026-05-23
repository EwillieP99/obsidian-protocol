// OBS2 — Obsidian Protocol binary save format (Phase 5).
//
// A compact, self-describing replacement for the V1 JSON save. The win comes
// from run-length encoding the per-chunk uint16 cell stream: real voxel art is
// dominated by long runs of air and repeated blocks, so RLE collapses a 4096-
// cell chunk to a handful of runs. Worst case (pathological no-run chunk) is
// 2x the raw 8 KB; typical builds compress by orders of magnitude versus the
// JSON `[x,y,z,blockId]` list.
//
// Pure TypeScript: imports only constants/types, no DOM/Three/React. Runs in
// `compress.worker.ts` (encode/decode) and on the main thread (`isOBS2` sniff
// from VoxelEngine.loadSave). `TextEncoder`/`TextDecoder` are used inside
// functions only, so importing this module is side-effect free in both scopes.
//
// ---------------------------------------------------------------------------
// Byte layout (little-endian throughout)
// ---------------------------------------------------------------------------
//
// Header (41 bytes):
//   magic     4   ASCII "OBS2"
//   version   u16 format version (current = 1)
//   flags     u16 reserved (0)
//   worldX    i16 \
//   worldY    i16  > world extents at save time (for validation)
//   worldZ    i16 /
//   chunkSize u8  edge length of a chunk (16)
//   chunkCount u32 number of non-empty chunks that follow
//   layerCount u16 number of layers that follow
//   cellCount  u32 total non-air cells (denormalized; for stats/validation)
//   createdAt  f64 epoch ms
//   updatedAt  f64 epoch ms
//
// Meta:
//   nameLen     u16 + name      (UTF-8)
//   thumbLen    u32 + thumbnail (UTF-8 data URL bytes; 0 = none)
//   contractLen u32 + contract  (UTF-8 JSON; 0 = none)
//
// Layers (layerCount times):
//   id      u16
//   nameLen u16 + name (UTF-8)
//   order   u16
//   opacity u8  (round(opacity * 255))
//   flags   u8  (bit0 visible, bit1 locked, bit2 solo)
//
// Chunks (chunkCount times):
//   cx u16 cy i16 cz i16   chunk coords (signed; can be negative)
//   runCount u32
//   runs (runCount times): runLength u16, packedCell u16
//     packedCell is the chunk's native encoding: low byte = blockIndex,
//     high byte = layer (see Chunk.ts).

import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_SIZE, WORLD_Y_ROUNDED } from '@/lib/constants';
import type { Contract } from '@/types';
import type { LayerMeta } from '@/types/engine';
import type { ChunkExport } from '@/engine/bridge/WorkerProtocol';

export const OBS2_VERSION = 1;
/** Maximum decoded save size (50 MB). */
export const OBS2_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
export const OBS2_MAX_CHUNK_COUNT = 100_000;
export const OBS2_MAX_LAYER_COUNT = 256;
export const OBS2_MAX_STRING_BYTES = 256 * 1024;
export const OBS2_MAX_RUN_COUNT = CHUNK_VOLUME;
/** ASCII "OBS2" → 0x4F 0x42 0x53 0x32. */
const MAGIC = [0x4f, 0x42, 0x53, 0x32] as const;
const HEADER_BYTES = 41;

export interface EncodeInput {
  chunks: ChunkExport[]; // only non-empty chunks
  layers: LayerMeta[];
  contract: Contract | null;
  name: string;
  thumbnail?: string;
  cellCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface DecodeOutput {
  chunks: ChunkExport[];
  layers: LayerMeta[];
  contract: Contract | null;
  name: string;
  thumbnail?: string;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
}

interface Run {
  len: number; // 1..CHUNK_VOLUME (fits u16 since CHUNK_VOLUME=4096)
  value: number; // packed uint16 cell
}

// ---------------------------------------------------------------------------
// RLE
// ---------------------------------------------------------------------------

function rleEncode(cells: Uint16Array): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < cells.length) {
    const value = cells[i];
    let j = i + 1;
    while (j < cells.length && cells[j] === value) j++;
    runs.push({ len: j - i, value });
    i = j;
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Sniff
// ---------------------------------------------------------------------------

/** True if `buffer` begins with the OBS2 magic. Cheap; safe on any buffer. */
export function isOBS2(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < MAGIC.length) return false;
  const u8 = new Uint8Array(buffer, 0, MAGIC.length);
  return u8[0] === MAGIC[0] && u8[1] === MAGIC[1] && u8[2] === MAGIC[2] && u8[3] === MAGIC[3];
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export function encodeOBS2(input: EncodeInput): ArrayBuffer {
  const enc = new TextEncoder();
  const now = Date.now();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const nameBytes = enc.encode(input.name);
  const thumbBytes = input.thumbnail ? enc.encode(input.thumbnail) : EMPTY;
  const contractBytes = input.contract ? enc.encode(JSON.stringify(input.contract)) : EMPTY;
  const layerNameBytes = input.layers.map((l) => enc.encode(l.name));
  const chunkRuns = input.chunks.map((c) => rleEncode(new Uint16Array(c.data)));

  // --- size pass ---
  let size = HEADER_BYTES;
  size += 2 + nameBytes.length;
  size += 4 + thumbBytes.length;
  size += 4 + contractBytes.length;
  for (const lnb of layerNameBytes) size += 8 + lnb.length;
  for (const runs of chunkRuns) size += 10 + runs.length * 4;

  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let off = 0;

  const u16 = (v: number) => { view.setUint16(off, v, true); off += 2; };
  const i16 = (v: number) => { view.setInt16(off, v, true); off += 2; };
  const u32 = (v: number) => { view.setUint32(off, v, true); off += 4; };
  const u8w = (v: number) => { view.setUint8(off, v); off += 1; };
  const f64 = (v: number) => { view.setFloat64(off, v, true); off += 8; };
  const bytes = (arr: Uint8Array) => { u8.set(arr, off); off += arr.length; };

  // Header
  u8.set(MAGIC, 0); off = 4;
  u16(OBS2_VERSION);
  u16(0); // flags
  i16(WORLD_SIZE);
  i16(WORLD_Y_ROUNDED);
  i16(WORLD_SIZE);
  u8w(CHUNK_SIZE);
  u32(input.chunks.length);
  u16(input.layers.length);
  u32(input.cellCount);
  f64(createdAt);
  f64(updatedAt);

  // Meta
  u16(nameBytes.length); bytes(nameBytes);
  u32(thumbBytes.length); bytes(thumbBytes);
  u32(contractBytes.length); bytes(contractBytes);

  // Layers
  for (let i = 0; i < input.layers.length; i++) {
    const l = input.layers[i];
    const lnb = layerNameBytes[i];
    u16(l.id);
    u16(lnb.length); bytes(lnb);
    u16(l.order ?? l.id);
    u8w(Math.round(clamp01(l.opacity ?? 1) * 255));
    u8w((l.visible ? 1 : 0) | (l.locked ? 2 : 0) | (l.solo ? 4 : 0));
  }

  // Chunks
  for (let i = 0; i < input.chunks.length; i++) {
    const c = input.chunks[i];
    const runs = chunkRuns[i];
    i16(c.cx);
    i16(c.cy);
    i16(c.cz);
    u32(runs.length);
    for (const r of runs) {
      u16(r.len);
      u16(r.value);
    }
  }

  return buf;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export function decodeOBS2(buffer: ArrayBuffer): DecodeOutput {
  if (!isOBS2(buffer)) throw new Error('decodeOBS2: bad magic (not an OBS2 buffer)');
  if (buffer.byteLength > OBS2_MAX_BUFFER_BYTES) {
    throw new Error(`decodeOBS2: buffer too large (${buffer.byteLength} bytes)`);
  }
  const view = new DataView(buffer);
  let off = 4; // past magic

  const u16 = () => { const v = view.getUint16(off, true); off += 2; return v; };
  const i16 = () => { const v = view.getInt16(off, true); off += 2; return v; };
  const u32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const u8r = () => { const v = view.getUint8(off); off += 1; return v; };
  const f64 = () => { const v = view.getFloat64(off, true); off += 8; return v; };
  const dec = new TextDecoder();
  const str = (len: number) => {
    if (len > OBS2_MAX_STRING_BYTES) throw new Error(`decodeOBS2: string too long (${len} bytes)`);
    if (off + len > buffer.byteLength) throw new Error('decodeOBS2: truncated string');
    if (len === 0) return '';
    const s = dec.decode(new Uint8Array(buffer, off, len));
    off += len;
    return s;
  };

  const version = u16();
  if (version !== OBS2_VERSION) throw new Error(`decodeOBS2: unsupported version ${version}`);
  u16(); // flags (reserved)
  i16(); i16(); i16(); // world extents — read but not enforced in 5a
  u8r(); // chunkSize — assumed CHUNK_SIZE
  const chunkCount = u32();
  const layerCount = u16();
  if (chunkCount > OBS2_MAX_CHUNK_COUNT) {
    throw new Error(`decodeOBS2: chunkCount ${chunkCount} exceeds limit`);
  }
  if (layerCount > OBS2_MAX_LAYER_COUNT) {
    throw new Error(`decodeOBS2: layerCount ${layerCount} exceeds limit`);
  }
  const cellCount = u32();
  const createdAt = f64();
  const updatedAt = f64();

  // Meta
  const name = str(u16());
  const thumbLen = u32();
  const thumbnail = thumbLen > 0 ? str(thumbLen) : undefined;
  const contractLen = u32();
  const contract: Contract | null = contractLen > 0 ? (JSON.parse(str(contractLen)) as Contract) : null;

  // Layers
  const layers: LayerMeta[] = [];
  for (let i = 0; i < layerCount; i++) {
    const id = u16();
    const lname = str(u16());
    const order = u16();
    const opacity = u8r() / 255;
    const flags = u8r();
    layers.push({
      id,
      name: lname,
      order,
      opacity,
      visible: (flags & 1) !== 0,
      locked: (flags & 2) !== 0,
      solo: (flags & 4) !== 0,
    });
  }

  // Chunks
  const chunks: ChunkExport[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const cx = i16();
    const cy = i16();
    const cz = i16();
    const runCount = u32();
    if (runCount > OBS2_MAX_RUN_COUNT) {
      throw new Error(`decodeOBS2: runCount ${runCount} exceeds limit`);
    }
    const cells = new Uint16Array(CHUNK_VOLUME);
    let pos = 0;
    for (let r = 0; r < runCount; r++) {
      const len = u16();
      const value = u16();
      const end = pos + len;
      if (end > CHUNK_VOLUME) throw new Error('decodeOBS2: chunk run overflow');
      if (value !== 0) cells.fill(value, pos, end);
      pos = end;
    }
    chunks.push({ cx, cy, cz, data: cells.buffer });
  }

  return { chunks, layers, contract, name, thumbnail, cellCount, createdAt, updatedAt };
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const EMPTY = new Uint8Array(0);

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
