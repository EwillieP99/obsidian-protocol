import type { Contract, BlockId } from '@/types';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import { rng, uid, key } from '@/lib/utils';
import { HALF, WORLD_HEIGHT } from '@/lib/constants';

const CLIENTS = [
  'ARASHI ZAIBATSU',
  'CHRYSALIS MEDICAL',
  'BLACKWALL ANALYTICS',
  'KESHI / KIRKE-9',
  'NEXUS IMMOBILIS',
  'SPECTRUM COMMS',
  'OBSIDIAN GHOST DIVISION',
  'VELVET YAKUZA',
  'PSIONIC HORIZON',
  'GRAY MARKET COLLECTIVE',
];

const CODENAMES = [
  'CRIMSON HAIKU',
  'ECHO OF VANTABLACK',
  'NIGHTINGALE PROTOCOL',
  'SPIRE OF SILVER',
  'GLITCHWOMB',
  'NEON MOTHER',
  'PROJECT VOIDFAULT',
  'DEAD ANGELS',
  'HALO BURNOUT',
  'CHROME OUROBOROS',
];

const BRIEFS = [
  'Reinforce the central tower against Arasaka neural intrusion. Stabilize at all costs.',
  'Fabricate a glitch-zone pocket dimension to obscure black-market data caches.',
  'Construct a vertical megachurch of holographic light for tonight\'s ad rotation.',
  'Restore foundational obsidian after a Gray Market raid corrupted the substrate.',
  'Erect a power spine from foundation to spire crown — every layer must conduct.',
  'Disguise a corporate observatory as a half-collapsed slum tower. Plausible deniability matters.',
  'Build a lattice of neural nodes that can survive a 30% anomaly pressure event.',
  'Decorate the Velvet Yakuza shrine with at least 64 magenta glyphs. Discretion encouraged.',
  'Test substrate integrity by saturating one layer with toxic cores. Document the cascade.',
  'Sketch a vault that screams in 4D. We\'ll know it when we see it.',
];

export function generateContract(seed = Date.now()): Contract {
  const r = rng(seed);
  const hazards: Array<Contract['hazard']> = ['low', 'medium', 'high', 'critical'];
  return {
    id: uid(),
    seed,
    client: CLIENTS[Math.floor(r() * CLIENTS.length)],
    codename: CODENAMES[Math.floor(r() * CODENAMES.length)],
    brief: BRIEFS[Math.floor(r() * BRIEFS.length)],
    payout: Math.round((4_000 + r() * 96_000) / 500) * 500,
    hazard: hazards[Math.min(3, Math.floor(r() * 4))],
  };
}

/**
 * Spawn a procedural starting structure inspired by the contract. Replaces
 * existing cells: caller is responsible for preserving via undo entry.
 */
export function applyContract(c: Contract) {
  const r = rng(c.seed);
  const ops: Array<{ x: number; y: number; z: number; block: BlockId | null }> = [];

  // Clear existing cells first as a single op batch.
  for (const d of getVoxelEngine().getAllCells()) {
    ops.push({ x: d.x, y: d.y, z: d.z, block: null });
  }

  // Variant by hazard level
  const towers = c.hazard === 'critical' ? 6 : c.hazard === 'high' ? 4 : c.hazard === 'medium' ? 3 : 2;
  const usedBases = new Set<string>();

  for (let t = 0; t < towers; t++) {
    let bx = 0, bz = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      bx = Math.floor((r() * 2 - 1) * (HALF - 6));
      bz = Math.floor((r() * 2 - 1) * (HALF - 6));
      if (!usedBases.has(`${bx},${bz}`)) break;
    }
    usedBases.add(`${bx},${bz}`);

    const w = 2 + Math.floor(r() * 3);
    const d = 2 + Math.floor(r() * 3);
    const h = 4 + Math.floor(r() * (WORLD_HEIGHT - 5));
    const skin: BlockId = r() > 0.55 ? 'corp-glass' : 'chrome';
    const accent: BlockId = r() > 0.5 ? 'neon-cyan' : 'neon-magenta';

    for (let dx = -w; dx <= w; dx++) {
      for (let dz = -d; dz <= d; dz++) {
        for (let y = 0; y < h; y++) {
          const onShell = Math.abs(dx) === w || Math.abs(dz) === d;
          if (!onShell && y !== 0 && y !== h - 1) continue;
          const x = bx + dx;
          const z = bz + dz;
          if (x < -HALF || x >= HALF || z < -HALF || z >= HALF) continue;
          // accents at the spire crown and at every 3rd layer
          let block: BlockId = 'obsidian';
          if (y === 0) block = 'obsidian';
          else if (y === h - 1) block = accent;
          else if (y % 3 === 0 && onShell) block = accent;
          else if (onShell) block = skin;
          else block = 'obsidian';
          ops.push({ x, y, z, block });
        }
      }
    }

    // Power spine through center of tower
    for (let y = 0; y < h; y++) {
      ops.push({ x: bx, y, z: bz, block: 'power-line' });
    }

    // Crown a neural node atop tall towers
    if (h > WORLD_HEIGHT - 4) {
      ops.push({ x: bx, y: h, z: bz, block: 'neural-node' });
    }
  }

  // Glitch zones for high-hazard contracts
  if (c.hazard === 'high' || c.hazard === 'critical') {
    const zones = c.hazard === 'critical' ? 14 : 6;
    for (let i = 0; i < zones; i++) {
      const gx = Math.floor((r() * 2 - 1) * (HALF - 2));
      const gz = Math.floor((r() * 2 - 1) * (HALF - 2));
      const gy = Math.floor(r() * (WORLD_HEIGHT - 1));
      ops.push({ x: gx, y: gy, z: gz, block: 'glitch' });
    }
  }

  // Sprinkle data streams
  for (let i = 0; i < 40; i++) {
    const dx = Math.floor((r() * 2 - 1) * (HALF - 1));
    const dz = Math.floor((r() * 2 - 1) * (HALF - 1));
    const dy = 1 + Math.floor(r() * (WORLD_HEIGHT - 2));
    if (r() > 0.6) ops.push({ x: dx, y: dy, z: dz, block: 'data-stream' });
  }

  getVoxelEngine().applyOps(
    ops.map((o) => ({ x: o.x, y: o.y, z: o.z, blockId: o.block, layer: o.y })),
    `Generate ${c.codename}`,
  );
}
