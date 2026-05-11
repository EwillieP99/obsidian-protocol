import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CHUNK_SIZE, HALF, WORLD_SIZE, WORLD_Y_ROUNDED } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function unkey(k: string): [number, number, number] {
  const [x, y, z] = k.split(',').map(Number);
  return [x, y, z];
}

// ---- V2 chunk helpers --------------------------------------------------

/**
 * Integer division that rounds towards -inf (unlike JS `/` + truncation which
 * rounds towards 0). Required so negative voxel coordinates map to the
 * correct chunk: chunkCoord(-1, 16) must be -1, not 0.
 */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Modulo that always returns a non-negative result for non-negative `b`. */
function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Chunk coordinate that contains the given world cell on one axis. */
export function chunkCoord(world: number): number {
  return floorDiv(world, CHUNK_SIZE);
}

/** "cx,cy,cz" canonical key for the chunk that contains (x,y,z). */
export function chunkKey(x: number, y: number, z: number): string {
  return `${chunkCoord(x)},${chunkCoord(y)},${chunkCoord(z)}`;
}

/**
 * Local linear index inside a chunk's flat Uint16Array[CHUNK_VOLUME].
 * Layout: index = (y_local << 8) | (z_local << 4) | x_local for CHUNK_SIZE=16.
 * Inputs are world coords; the function reduces them to local automatically.
 */
export function localIdx(x: number, y: number, z: number): number {
  const lx = floorMod(x, CHUNK_SIZE);
  const ly = floorMod(y, CHUNK_SIZE);
  const lz = floorMod(z, CHUNK_SIZE);
  // CHUNK_SIZE is a power of two; bit-shifts are valid.
  return (ly << 8) | (lz << 4) | lx;
}

/**
 * Globally unique linear cell index used by RenderBridge's SlotAllocator.
 * Maps any (x,y,z) within V1 world bounds to a non-negative integer.
 *
 * Layout: (xOffset) + (zOffset * WORLD_SIZE) + (y * WORLD_SIZE * WORLD_SIZE).
 * Range: 0 .. WORLD_SIZE * WORLD_SIZE * WORLD_Y_ROUNDED - 1.
 */
export function cellLinearIdx(x: number, y: number, z: number): number {
  const xo = x + HALF;
  const zo = z + HALF;
  return xo + zo * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE;
}

/** Inverse of cellLinearIdx — primarily for debugging / dev tools. */
export function cellLinearIdxToCoord(idx: number): [number, number, number] {
  const layer = WORLD_SIZE * WORLD_SIZE;
  const y = Math.floor(idx / layer);
  const rem = idx - y * layer;
  const z = Math.floor(rem / WORLD_SIZE) - HALF;
  const x = (rem % WORLD_SIZE) - HALF;
  return [x, y, z];
}

/** Whether (x,y,z) lies inside the engine's addressable world. */
export function inWorld(x: number, y: number, z: number): boolean {
  return (
    x >= -HALF &&
    x < HALF &&
    z >= -HALF &&
    z < HALF &&
    y >= 0 &&
    y < WORLD_Y_ROUNDED
  );
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Mulberry32 — small, deterministic PRNG used for seeded generation.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
}
