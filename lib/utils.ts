import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
