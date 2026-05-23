/**
 * extract-prefabs.mjs
 *
 * Reads the 5 example vault JSONs, extracts 3-4 interesting sub-regions per
 * vault, and writes lib/artifacts/prefabs.ts.
 *
 * Run: node scripts/extract-prefabs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXAMPLES_DIR = path.join(ROOT, 'public/examples');
const OUT_DIR = path.join(ROOT, 'lib/artifacts');
const OUT_FILE = path.join(OUT_DIR, 'prefabs.ts');

const EXAMPLE_CONFIGS = [
  {
    file: 'velvet-shrine.json',
    slug: 'shrine',
    primaryTags: ['shrine'],
    regionNames: ['Shrine Foundation', 'Shrine Altar', 'Shrine Neon Ring', 'Shrine Crown'],
  },
  {
    file: 'blackspire-arcology.json',
    slug: 'arcology',
    primaryTags: ['structure'],
    regionNames: ['Arcology Base', 'Data Tower Segment', 'Arcology Core', 'Arcology Crown'],
  },
  {
    file: 'megaspire.json',
    slug: 'megaspire',
    primaryTags: ['spire', 'structure'],
    regionNames: ['Megaspire Base', 'Megaspire Glass Ring', 'Megaspire Cyan Band', 'Megaspire Crown'],
  },
  {
    file: 'glitchfield.json',
    slug: 'glitch',
    primaryTags: ['glitch'],
    regionNames: ['Glitch Ground', 'Glitch Tower', 'Glitch Core', 'Glitch Apex'],
  },
  {
    file: 'ghost-cathedral.json',
    slug: 'cathedral',
    primaryTags: ['arch'],
    regionNames: ['Cathedral Foundation', 'Cathedral Arch', 'Cathedral Neon Sigil', 'Cathedral Spire'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function inferExtraTags(rawCells) {
  const blocks = new Set(rawCells.map(c => c[3]));
  const tags = [];
  if (blocks.has('neon-cyan') || blocks.has('neon-magenta')) tags.push('neon');
  if (blocks.has('glitch') || blocks.has('circuit')) tags.push('glitch');
  if (blocks.has('neural-node') || blocks.has('data-stream')) tags.push('data');
  if (blocks.has('toxic-core')) tags.push('energy');
  if (blocks.has('holo-billboard')) tags.push('neon');
  return tags;
}

function normalize(rawCells) {
  const xs = rawCells.map(c => c[0]);
  const ys = rawCells.map(c => c[1]);
  const zs = rawCells.map(c => c[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const anchorX = Math.round((minX + maxX) / 2);
  const anchorY = minY;
  const anchorZ = Math.round((minZ + maxZ) / 2);
  return {
    anchor: [anchorX, anchorY, anchorZ],
    cells: rawCells.map(c => ({
      dx: c[0] - anchorX,
      dy: c[1] - anchorY,
      dz: c[2] - anchorZ,
      blockId: c[3],
      layer: c[1],
    })),
  };
}

/** Block-count fingerprint for deduplication */
function sigOf(rawCells) {
  const counts = {};
  for (const c of rawCells) {
    counts[c[3]] = (counts[c[3]] || 0) + 1;
  }
  return JSON.stringify(Object.entries(counts).sort());
}

/** Find the densest halfW×halfW XZ sliding window among the given cells */
function denseWindow(cells, halfW = 3) {
  const uniqueXs = [...new Set(cells.map(c => c[0]))];
  const uniqueZs = [...new Set(cells.map(c => c[2]))];
  let best = null;
  let bestCount = 0;
  for (const cx of uniqueXs) {
    for (const cz of uniqueZs) {
      const inW = cells.filter(
        c =>
          c[0] >= cx - halfW &&
          c[0] <= cx + halfW &&
          c[2] >= cz - halfW &&
          c[2] <= cz + halfW,
      );
      if (inW.length > bestCount) {
        bestCount = inW.length;
        best = { cx, cz, cells: inW };
      }
    }
  }
  return best;
}

/** Sample every Nth cell so the region stays ≤ maxCells */
function cap(cells, maxCells = 40) {
  if (cells.length <= maxCells) return cells;
  const step = Math.ceil(cells.length / maxCells);
  return cells.filter((_, i) => i % step === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractRegions(data, config) {
  const allCells = data.cells; // [x, y, z, blockId]
  const ys = allCells.map(c => c[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midY = Math.round((minY + maxY) / 2);

  const usedSigs = new Set();
  const results = [];
  const names = config.regionNames;

  function push(name, rawCells, extraTags = []) {
    if (rawCells.length < 5) return false;
    const sig = sigOf(rawCells);
    if (usedSigs.has(sig)) return false;
    usedSigs.add(sig);
    const { anchor, cells } = normalize(rawCells);
    const tags = [...new Set([...config.primaryTags, ...inferExtraTags(rawCells), ...extraTags])];
    results.push({ name, anchor, cells, tags });
    return true;
  }

  // ── Region 0: Foundation (y=minY, densest 7×7 window) ────────────────────
  {
    const layer0 = allCells.filter(c => c[1] === minY);
    if (layer0.length > 0) {
      const dense = denseWindow(layer0, 3) ?? { cells: layer0 };
      push(names[0], cap(dense.cells, 40), ['structure']);
    }
  }

  // ── Region 1: Feature column / vertical cluster ────────────────────────────
  // Find the XZ coordinate with the tallest vertical span, then grab a 2-radius
  // neighbourhood across all y.
  {
    const spanMap = new Map();
    for (const c of allCells) {
      const key = `${c[0]},${c[2]}`;
      if (!spanMap.has(key)) spanMap.set(key, { minY: c[1], maxY: c[1], x: c[0], z: c[2] });
      const e = spanMap.get(key);
      e.minY = Math.min(e.minY, c[1]);
      e.maxY = Math.max(e.maxY, c[1]);
    }
    // Score: prefer tall AND non-obsidian-only columns
    const nonObs = allCells.filter(c => c[3] !== 'obsidian' && c[3] !== 'chrome');
    const spanMap2 = new Map();
    for (const c of nonObs) {
      const key = `${c[0]},${c[2]}`;
      if (!spanMap2.has(key)) spanMap2.set(key, { minY: c[1], maxY: c[1], x: c[0], z: c[2] });
      const e = spanMap2.get(key);
      e.minY = Math.min(e.minY, c[1]);
      e.maxY = Math.max(e.maxY, c[1]);
    }
    const candidates = [...spanMap2.values()].sort(
      (a, b) => b.maxY - b.minY - (a.maxY - a.minY),
    );
    const best = candidates[0];
    if (best) {
      const colCells = allCells.filter(
        c => Math.abs(c[0] - best.x) <= 2 && Math.abs(c[2] - best.z) <= 2,
      );
      push(names[1], cap(colCells, 40));
    }
  }

  // ── Region 2: Mid-section cross-slice (3-layer band around mid) ───────────
  {
    const midCells = allCells.filter(c => c[1] >= midY - 1 && c[1] <= midY + 2);
    if (midCells.length >= 5) {
      const dense = denseWindow(midCells, 3) ?? { cells: midCells };
      push(names[2], cap(dense.cells, 40));
    }
  }

  // ── Region 3: Crown (top 2–3 layers) ─────────────────────────────────────
  {
    let crownCells = allCells.filter(c => c[1] >= maxY - 1);
    if (crownCells.length < 5) crownCells = allCells.filter(c => c[1] >= maxY - 2);
    if (crownCells.length < 5) crownCells = allCells.filter(c => c[1] >= maxY - 3);
    if (crownCells.length >= 5) {
      push(names[3], cap(crownCells, 40), ['spire']);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialise a single prefab to TypeScript source
// ─────────────────────────────────────────────────────────────────────────────

function prefabToTS(prefab, id) {
  const cellLines = prefab.cells
    .map(
      c =>
        `      { dx: ${c.dx}, dy: ${c.dy}, dz: ${c.dz}, blockId: '${c.blockId}', layer: ${c.layer} }`,
    )
    .join(',\n');

  const tags = JSON.stringify(prefab.tags);
  const anchor = JSON.stringify(prefab.anchor);

  return `  {
    id: '${id}',
    name: '${prefab.name}',
    type: 'prefab',
    tags: ${tags},
    anchor: ${anchor},
    cells: [
${cellLines},
    ],
    createdAt: 0,
  }`;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const allPrefabs = [];
const stats = {};

for (const config of EXAMPLE_CONFIGS) {
  const filePath = path.join(EXAMPLES_DIR, config.file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`  ⚠ Could not read ${config.file}: ${err.message}`);
    continue;
  }

  const regions = extractRegions(data, config);
  stats[config.file] = regions.length;
  console.log(`  ${config.file}: ${regions.length} prefabs`);

  for (const region of regions) {
    allPrefabs.push({ ...region, _slug: config.slug });
  }
}

// Sort alphabetically by name
allPrefabs.sort((a, b) => a.name.localeCompare(b.name));

// Build TS source
const blocks = allPrefabs.map(p => {
  const id = `prefab_${slugify(p.name)}`;
  return prefabToTS(p, id);
});

const tsSource = `import type { Artifact } from '@/lib/artifacts';

export const SHIPPED_PREFABS: Artifact[] = [
${blocks.join(',\n')}
];
`;

// Ensure output directory exists
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, tsSource, 'utf8');

console.log(`\n✓ Wrote ${allPrefabs.length} prefabs to ${path.relative(ROOT, OUT_FILE)}`);
console.log('  Per-file breakdown:');
for (const [file, count] of Object.entries(stats)) {
  console.log(`    ${file}: ${count}`);
}
