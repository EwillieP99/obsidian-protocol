'use client';

import { create } from 'zustand';
import type { BlockId, Vec3 } from '@/types';

export interface Particle {
  id: number;
  pos: Vec3;
  vel: Vec3;
  life: number; // seconds remaining
  maxLife: number;
  color: string;
  size: number;
}

export interface FlashCells {
  /** Cells to flash (e.g. for undo/redo highlight). */
  keys: string[];
  color: string;
  /** seconds left */
  life: number;
  maxLife: number;
}

interface EffectsState {
  particles: Particle[];
  /** Camera shake intensity 0..1, decays each frame. */
  shake: number;
  /** Multiplier on bloom intensity, decays back to 1. */
  bloomFlash: number;
  /** Cells to highlight (undo/redo flash). */
  flashCells: FlashCells | null;
  /** Cell to focus camera on (used by Focus-on-Selection). null = off. */
  focusTarget: Vec3 | null;

  /** Spawn placement particles at a set of cells. mode = 'place' | 'erase' | 'flash'. */
  spawnPlacementBurst: (cells: Array<Vec3>, color: string, mode: 'place' | 'erase') => void;
  /** Add screen shake. magnitude in 0..1 range. */
  pushShake: (magnitude: number) => void;
  /** Pulse bloom for a frame or two (fades back). */
  pulseBloom: (intensity: number) => void;
  /** Highlight cells briefly (undo/redo). */
  highlightCells: (keys: string[], color: string, ms?: number) => void;
  /** Set focus target for camera fly-to. */
  setFocus: (cell: Vec3 | null) => void;
  /** Per-frame tick (called from R3F). dt in seconds. */
  tick: (dt: number) => void;
  /** Wipe all transient effects. */
  reset: () => void;
}

let pid = 0;

export const useEffectsStore = create<EffectsState>((set, get) => ({
  particles: [],
  shake: 0,
  bloomFlash: 1,
  flashCells: null,
  focusTarget: null,

  spawnPlacementBurst: (cells, color, mode) => {
    const cap = 240; // hard cap to keep cost bounded
    const perCell = mode === 'erase' ? 5 : 4;
    const wanted = Math.min(cap, cells.length * perCell);
    const stride = Math.max(1, Math.floor((cells.length * perCell) / wanted));

    const next: Particle[] = get().particles.slice();
    let emitted = 0;
    for (let i = 0; i < cells.length && emitted < wanted; i++) {
      for (let j = 0; j < perCell && emitted < wanted; j++) {
        if (((i * perCell + j) % stride) !== 0) continue;
        const [x, y, z] = cells[i];
        const speed = mode === 'erase' ? 1.6 : 1.1;
        const angle = Math.random() * Math.PI * 2;
        const upward = mode === 'erase' ? Math.random() * 0.6 - 0.3 : 0.4 + Math.random() * 0.6;
        const vx = Math.cos(angle) * speed * (0.4 + Math.random() * 0.8);
        const vz = Math.sin(angle) * speed * (0.4 + Math.random() * 0.8);
        const vy = upward + Math.random() * 0.4;
        const life = 0.45 + Math.random() * 0.35;
        next.push({
          id: ++pid,
          pos: [x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4],
          vel: [vx, vy, vz],
          life,
          maxLife: life,
          color,
          size: 0.07 + Math.random() * 0.07,
        });
        emitted++;
      }
    }

    // If over hard cap, drop oldest.
    const HARD_CAP = 360;
    if (next.length > HARD_CAP) next.splice(0, next.length - HARD_CAP);
    set({ particles: next });
  },

  pushShake: (magnitude) => {
    const cur = get().shake;
    set({ shake: Math.min(1, cur + magnitude) });
  },

  pulseBloom: (intensity) => {
    const cur = get().bloomFlash;
    set({ bloomFlash: Math.max(cur, intensity) });
  },

  highlightCells: (keys, color, ms = 600) => {
    if (keys.length === 0) return;
    const life = ms / 1000;
    set({ flashCells: { keys, color, life, maxLife: life } });
  },

  setFocus: (cell) => set({ focusTarget: cell }),

  tick: (dt) => {
    const s = get();
    // Particles: integrate, decay
    let particles = s.particles;
    if (particles.length > 0) {
      const next: Particle[] = [];
      for (const p of particles) {
        const newLife = p.life - dt;
        if (newLife <= 0) continue;
        // Apply gravity-ish drag
        const drag = Math.exp(-dt * 1.2);
        const newVel: Vec3 = [p.vel[0] * drag, p.vel[1] * drag - dt * 1.4, p.vel[2] * drag];
        const newPos: Vec3 = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt, p.pos[2] + p.vel[2] * dt];
        next.push({ ...p, pos: newPos, vel: newVel, life: newLife });
      }
      particles = next;
    }
    // Shake decay
    const shake = Math.max(0, s.shake - dt * 2.4);
    // Bloom flash decay back to 1
    const bloomFlash = s.bloomFlash > 1 ? Math.max(1, s.bloomFlash - dt * 2.0) : 1;
    // Cell highlight decay
    let flashCells = s.flashCells;
    if (flashCells) {
      const life = flashCells.life - dt;
      flashCells = life > 0 ? { ...flashCells, life } : null;
    }

    if (
      particles !== s.particles ||
      shake !== s.shake ||
      bloomFlash !== s.bloomFlash ||
      flashCells !== s.flashCells
    ) {
      set({ particles, shake, bloomFlash, flashCells });
    }
  },

  reset: () => set({ particles: [], shake: 0, bloomFlash: 1, flashCells: null, focusTarget: null }),
}));
