// Generates example save JSONs in /public/examples/.
// Run with: node scripts/build-examples.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'examples');
mkdirSync(OUT_DIR, { recursive: true });

const HALF = 24;
const WORLD_HEIGHT = 12;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const layers = Array.from({ length: WORLD_HEIGHT }, (_, i) => ({
  id: i,
  name: i === 0 ? 'Foundation' : i === WORLD_HEIGHT - 1 ? 'Spire Crown' : `Layer ${String(i).padStart(2, '0')}`,
  visible: true,
  locked: false,
  solo: false,
}));

function emit(name, cells, contract) {
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (const [x, y, z] of cells) {
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  }
  return {
    version: 1,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bounds: cells.length ? { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] } : { min: [0,0,0], max: [0,0,0] },
    layers,
    cells,
    contract,
  };
}

function inB(x, z) { return x >= -HALF && x < HALF && z >= -HALF && z < HALF; }

// ------------------------- MEGASPIRE -------------------------
{
  const cells = [];
  const r = mulberry32(1337);
  // Foundation slab
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
    cells.push([x, 0, z, 'obsidian']);
  }
  // Central tower
  const H = WORLD_HEIGHT - 1;
  for (let y = 1; y < H; y++) {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const onShell = Math.abs(dx) === 3 || Math.abs(dz) === 3;
      if (!onShell) continue;
      cells.push([dx, y, dz, y % 3 === 0 ? 'neon-cyan' : 'corp-glass']);
    }
    // Power spine
    cells.push([0, y, 0, 'power-line']);
  }
  // Crown
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    cells.push([dx, H, dz, 'chrome']);
  }
  cells.push([0, H, 0, 'neural-node']);

  // Surrounding spires
  const spireBases = [[-8, -8], [8, -8], [-8, 8], [8, 8], [-12, 0], [12, 0], [0, -12], [0, 12]];
  for (const [bx, bz] of spireBases) {
    const h = 4 + Math.floor(r() * 5);
    for (let y = 1; y <= h; y++) cells.push([bx, y, bz, 'chrome']);
    cells.push([bx, h + 1, bz, 'neon-magenta']);
  }

  // Sponsored hallucinations
  for (let i = 0; i < 6; i++) {
    const x = -10 + i * 4;
    cells.push([x, 7, -8, 'holo-billboard']);
  }

  // Data streams
  for (let y = 2; y < H; y += 2) {
    for (let i = 0; i < 6; i++) {
      const x = -6 + Math.floor(r() * 12);
      const z = -6 + Math.floor(r() * 12);
      if (inB(x, z)) cells.push([x, y, z, 'data-stream']);
    }
  }

  writeFileSync(join(OUT_DIR, 'megaspire.json'), JSON.stringify(
    emit('Megaspire (Demo)', cells, {
      id: 'demo-megaspire',
      seed: 1337,
      client: 'NEXUS IMMOBILIS',
      codename: 'CHROME OUROBOROS',
      brief: 'Erect a megaspire fit for the Architect-General. Power must reach every layer.',
      payout: 64500,
      hazard: 'medium',
    }),
    null, 2,
  ));
}

// ------------------------- GLITCH FIELD -------------------------
{
  const cells = [];
  const r = mulberry32(8675309);
  // Cratered foundation
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
    if (r() < 0.85) cells.push([x, 0, z, 'obsidian']);
  }
  // Scatter glitch towers
  for (let i = 0; i < 28; i++) {
    const cx = -10 + Math.floor(r() * 21);
    const cz = -10 + Math.floor(r() * 21);
    const h = 1 + Math.floor(r() * (WORLD_HEIGHT - 2));
    for (let y = 1; y <= h; y++) {
      cells.push([cx, y, cz, r() < 0.55 ? 'glitch' : 'circuit']);
    }
    if (r() < 0.4) cells.push([cx, h + 1, cz, 'toxic-core']);
  }
  // Stray neural nodes
  for (let i = 0; i < 8; i++) {
    cells.push([Math.floor(r() * 20 - 10), Math.floor(r() * (WORLD_HEIGHT - 1)), Math.floor(r() * 20 - 10), 'neural-node']);
  }
  // Data waterfalls
  for (let i = 0; i < 30; i++) {
    cells.push([Math.floor(r() * 22 - 11), 1 + Math.floor(r() * (WORLD_HEIGHT - 2)), Math.floor(r() * 22 - 11), 'data-stream']);
  }

  writeFileSync(join(OUT_DIR, 'glitchfield.json'), JSON.stringify(
    emit('Glitch Field', cells, {
      id: 'demo-glitchfield',
      seed: 8675309,
      client: 'OBSIDIAN GHOST DIVISION',
      codename: 'GLITCHWOMB',
      brief: 'Generate a glitch-zone pocket. Ghost Division will move payloads through it tonight.',
      payout: 88000,
      hazard: 'critical',
    }),
    null, 2,
  ));
}

// ------------------------- VELVET SHRINE -------------------------
{
  const cells = [];
  const r = mulberry32(424242);
  // Plinth
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    cells.push([x, 0, z, 'chrome']);
  }
  // Pillars
  const pillars = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
  for (const [px, pz] of pillars) {
    for (let y = 1; y <= 6; y++) cells.push([px, y, pz, 'obsidian']);
    cells.push([px, 7, pz, 'neon-magenta']);
  }
  // Magenta arches
  for (let x = -3; x <= 3; x++) {
    cells.push([x, 6, -3, 'neon-magenta']);
    cells.push([x, 6, 3, 'neon-magenta']);
  }
  for (let z = -3; z <= 3; z++) {
    cells.push([-3, 6, z, 'neon-magenta']);
    cells.push([3, 6, z, 'neon-magenta']);
  }
  // Inner shrine
  cells.push([0, 1, 0, 'toxic-core']);
  cells.push([0, 2, 0, 'neural-node']);
  cells.push([0, 3, 0, 'neural-node']);
  cells.push([0, 4, 0, 'toxic-core']);
  // Holo glyphs floating in
  for (let i = 0; i < 10; i++) {
    cells.push([Math.floor(r() * 7 - 3), 8 + Math.floor(r() * 3), Math.floor(r() * 7 - 3), 'holo-billboard']);
  }
  // Power supply
  for (let y = 1; y <= 5; y++) cells.push([-2, y, 0, 'power-line']);
  for (let y = 1; y <= 5; y++) cells.push([2, y, 0, 'power-line']);

  writeFileSync(join(OUT_DIR, 'velvet-shrine.json'), JSON.stringify(
    emit('Velvet Shrine', cells, {
      id: 'demo-velvet',
      seed: 424242,
      client: 'VELVET YAKUZA',
      codename: 'CRIMSON HAIKU',
      brief: 'A shrine for the Velvet Yakuza. Magenta only. Make the city bow.',
      payout: 32000,
      hazard: 'low',
    }),
    null, 2,
  ));
}

// ------------------------- BLACKSPIRE ARCOLOGY -------------------------
// Dense megastructure: stacked towers + interconnecting bridges + power lattice.
// Showcases performance work (3000+ voxels at 60FPS on the high-quality preset).
{
  const cells = [];
  const r = mulberry32(2077);
  const placed = new Set();
  const set = (x, y, z, b) => {
    if (!inB(x, z) || y < 0 || y >= WORLD_HEIGHT) return;
    const k = `${x},${y},${z}`;
    if (placed.has(k)) return;
    placed.add(k);
    cells.push([x, y, z, b]);
  };

  // Foundation slab — full grid, dense.
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) {
    if (Math.abs(x) > 18 && Math.abs(z) > 18) continue;
    set(x, 0, z, r() < 0.05 ? 'circuit' : 'obsidian');
  }

  // Five towers in cross formation.
  const towers = [
    { cx:  0, cz:  0, w: 4, h: WORLD_HEIGHT - 1, skin: 'chrome',     accent: 'neon-cyan' },
    { cx: 12, cz:  0, w: 3, h: WORLD_HEIGHT - 3, skin: 'corp-glass', accent: 'neon-cyan' },
    { cx:-12, cz:  0, w: 3, h: WORLD_HEIGHT - 4, skin: 'corp-glass', accent: 'neon-magenta' },
    { cx:  0, cz: 12, w: 3, h: WORLD_HEIGHT - 3, skin: 'chrome',     accent: 'neon-magenta' },
    { cx:  0, cz:-12, w: 3, h: WORLD_HEIGHT - 4, skin: 'corp-glass', accent: 'neon-cyan' },
  ];
  for (const t of towers) {
    for (let y = 1; y <= t.h; y++) {
      for (let dx = -t.w; dx <= t.w; dx++) for (let dz = -t.w; dz <= t.w; dz++) {
        const onShell = Math.abs(dx) === t.w || Math.abs(dz) === t.w;
        if (!onShell && y !== t.h) continue;
        const isAccent = (y % 4 === 0 && onShell) || y === t.h;
        set(t.cx + dx, y, t.cz + dz, isAccent ? t.accent : t.skin);
      }
    }
    // Power spine
    for (let y = 1; y <= t.h; y++) set(t.cx, y, t.cz, 'power-line');
    // Crown
    set(t.cx, t.h + 1 < WORLD_HEIGHT ? t.h + 1 : t.h, t.cz, 'neural-node');
  }

  // Sky bridges between central tower and outer towers.
  const bridge = (x1, z1, x2, z2, y, mat) => {
    const dx = Math.sign(x2 - x1), dz = Math.sign(z2 - z1);
    let x = x1, z = z1;
    while (x !== x2 || z !== z2) {
      set(x, y, z, mat);
      if (x !== x2) x += dx;
      else if (z !== z2) z += dz;
    }
    set(x2, y, z2, mat);
  };
  bridge( 4, 0, 11, 0, 6, 'circuit');
  bridge(-4, 0,-11, 0, 6, 'circuit');
  bridge( 0, 4, 0, 11, 6, 'circuit');
  bridge( 0,-4, 0,-11, 6, 'circuit');

  // Holo billboards
  for (let i = 0; i < 14; i++) {
    const x = -16 + Math.floor(r() * 32);
    const z = -16 + Math.floor(r() * 32);
    const y = 4 + Math.floor(r() * (WORLD_HEIGHT - 5));
    set(x, y, z, 'holo-billboard');
  }

  // Data streams woven through the layers
  for (let y = 2; y < WORLD_HEIGHT - 1; y += 1) {
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(r() * 36 - 18);
      const z = Math.floor(r() * 36 - 18);
      if (r() < 0.55) set(x, y, z, 'data-stream');
    }
  }

  // Toxic cores anchoring the corners of the foundation
  for (const [x, z] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) {
    set(x, 1, z, 'toxic-core');
    set(x, 2, z, 'neural-node');
  }

  writeFileSync(join(OUT_DIR, 'blackspire-arcology.json'), JSON.stringify(
    emit('Blackspire Arcology', cells, {
      id: 'demo-arcology',
      seed: 2077,
      client: 'NEXUS IMMOBILIS',
      codename: 'CHROME OUROBOROS',
      brief: 'Five-tower arcology with full sky-bridge lattice. Stress test for the substrate; document any cascade.',
      payout: 142000,
      hazard: 'high',
    }),
    null, 2,
  ));
}

// ------------------------- GHOST CATHEDRAL -------------------------
// Glitch-heavy artistic piece: chromatic aurora, leaning spires, sigils mid-air.
{
  const cells = [];
  const r = mulberry32(666666);
  const set = (x, y, z, b) => {
    if (!inB(x, z) || y < 0 || y >= WORLD_HEIGHT) return;
    cells.push([x, y, z, b]);
  };

  // Cracked basalt floor
  for (let x = -14; x <= 14; x++) for (let z = -14; z <= 14; z++) {
    if (r() < 0.92) set(x, 0, z, 'obsidian');
  }

  // Six leaning spires arranged on a hexagon
  const spireCount = 6;
  for (let i = 0; i < spireCount; i++) {
    const ang = (i / spireCount) * Math.PI * 2;
    const baseX = Math.round(Math.cos(ang) * 9);
    const baseZ = Math.round(Math.sin(ang) * 9);
    const h = WORLD_HEIGHT - 2;
    for (let y = 1; y <= h; y++) {
      // Lean toward the center as it climbs
      const t = y / h;
      const lx = Math.round(baseX * (1 - t * 0.55));
      const lz = Math.round(baseZ * (1 - t * 0.55));
      set(lx, y, lz, y % 2 === 0 ? 'glitch' : 'circuit');
      if (y === h) set(lx, y + 1, lz, 'neural-node');
    }
  }

  // Central sacrificial reactor stack
  for (let y = 1; y <= 4; y++) set(0, y, 0, 'toxic-core');
  set(0, 5, 0, 'neural-node');

  // Chromatic aurora — a dome of glitch + holo blocks high above
  for (let i = 0; i < 70; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 6 + r() * 4;
    const y = WORLD_HEIGHT - 2 - Math.floor(r() * 3);
    const x = Math.round(Math.cos(ang) * rad);
    const z = Math.round(Math.sin(ang) * rad);
    const block = r() < 0.45 ? 'glitch' : (r() < 0.5 ? 'holo-billboard' : 'data-stream');
    set(x, y, z, block);
  }

  // Floating sigils — magenta crosses suspended at varying heights
  const drawSigil = (cx, cy, cz) => {
    set(cx, cy, cz, 'neon-magenta');
    set(cx + 1, cy, cz, 'neon-magenta');
    set(cx - 1, cy, cz, 'neon-magenta');
    set(cx, cy, cz + 1, 'neon-magenta');
    set(cx, cy, cz - 1, 'neon-magenta');
  };
  for (let i = 0; i < 8; i++) {
    drawSigil(
      Math.round((r() * 2 - 1) * 10),
      3 + Math.floor(r() * 6),
      Math.round((r() * 2 - 1) * 10),
    );
  }

  // Power conduits running from the floor to each spire base
  for (let i = 0; i < spireCount; i++) {
    const ang = (i / spireCount) * Math.PI * 2;
    const baseX = Math.round(Math.cos(ang) * 9);
    const baseZ = Math.round(Math.sin(ang) * 9);
    let x = 0, z = 0;
    while (x !== baseX || z !== baseZ) {
      set(x, 0, z, 'power-line');
      if (x !== baseX) x += Math.sign(baseX - x);
      else if (z !== baseZ) z += Math.sign(baseZ - z);
    }
  }

  writeFileSync(join(OUT_DIR, 'ghost-cathedral.json'), JSON.stringify(
    emit('Ghost Cathedral', cells, {
      id: 'demo-cathedral',
      seed: 666666,
      client: 'OBSIDIAN GHOST DIVISION',
      codename: 'PROJECT VOIDFAULT',
      brief: 'Build a cathedral that screams. Glitch-saturated, magenta sigils suspended mid-air. Discretion encouraged.',
      payout: 119500,
      hazard: 'critical',
    }),
    null, 2,
  ));
}

console.log('Built example saves in', OUT_DIR);
