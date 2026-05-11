import type { BlockId, BlockType } from '@/types';

export const BLOCK_TYPES: Record<BlockId, BlockType> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    loreName: 'Vault Substrate',
    description: 'Compressed memory-glass. The foundational layer of every Vault.',
    category: 'structure',
    color: '#0a0a14',
    emissive: '#000000',
    emissiveIntensity: 0,
    stability: 1,
    anomaly: 0,
    metalness: 0.4,
    roughness: 0.45,
  },
  chrome: {
    id: 'chrome',
    name: 'Chrome',
    loreName: 'Mirrorsteel Lattice',
    description: 'Self-healing alloy used for load-bearing megastructure spines.',
    category: 'structure',
    color: '#9aa3b2',
    emissive: '#000000',
    emissiveIntensity: 0,
    stability: 0.95,
    anomaly: 0,
    metalness: 1,
    roughness: 0.18,
  },
  'corp-glass': {
    id: 'corp-glass',
    name: 'Corp Glass',
    loreName: 'Reinforced Polypane',
    description: 'Smart-tinted curtain wall used by every megacorp tower in the Sprawl.',
    category: 'structure',
    color: '#6ad6ff',
    emissive: '#003a55',
    emissiveIntensity: 0.25,
    stability: 0.7,
    anomaly: 0,
    metalness: 0.15,
    roughness: 0.05,
    transparent: true,
    opacity: 0.45,
  },
  'neon-cyan': {
    id: 'neon-cyan',
    name: 'Cyan Neon',
    loreName: 'Azure Sigil',
    description: 'A cold neon glyph. Drains slowly from the city grid.',
    category: 'neon',
    color: '#00f9ff',
    emissive: '#00f9ff',
    emissiveIntensity: 2.6,
    stability: 0.85,
    anomaly: 0,
    metalness: 0.1,
    roughness: 0.4,
  },
  'neon-magenta': {
    id: 'neon-magenta',
    name: 'Magenta Neon',
    loreName: 'Crimson Sigil',
    description: 'Hot magenta tube. Favored by the Velvet Yakuza and street shrines.',
    category: 'neon',
    color: '#ff00aa',
    emissive: '#ff00aa',
    emissiveIntensity: 2.6,
    stability: 0.85,
    anomaly: 0,
    metalness: 0.1,
    roughness: 0.4,
  },
  'toxic-core': {
    id: 'toxic-core',
    name: 'Toxic Core',
    loreName: 'Anomaly Reactor',
    description: 'A pulsing seed of unstable computation. Powers entire districts.',
    category: 'energy',
    color: '#9d00ff',
    emissive: '#c466ff',
    emissiveIntensity: 3.4,
    shader: 'pulse-core',
    stability: 0.55,
    anomaly: 0.3,
    metalness: 0.2,
    roughness: 0.3,
  },
  'data-stream': {
    id: 'data-stream',
    name: 'Data Stream',
    loreName: 'Liquid Bandwidth',
    description: 'Flowing packetwater. Carries district consciousness between vault tiers.',
    category: 'data',
    color: '#39ff14',
    emissive: '#39ff14',
    emissiveIntensity: 1.8,
    shader: 'data-waterfall',
    stability: 0.8,
    anomaly: 0.05,
    metalness: 0.0,
    roughness: 0.6,
    transparent: true,
    opacity: 0.85,
  },
  'holo-billboard': {
    id: 'holo-billboard',
    name: 'Holo Billboard',
    loreName: 'Sponsored Hallucination',
    description: 'Scrolling corporate ad. Whispers product names at street level.',
    category: 'data',
    color: '#ff66cc',
    emissive: '#ff66cc',
    emissiveIntensity: 2.0,
    shader: 'holo',
    stability: 0.75,
    anomaly: 0,
    metalness: 0,
    roughness: 0.3,
  },
  glitch: {
    id: 'glitch',
    name: 'Glitch Zone',
    loreName: 'Schism Field',
    description: 'A region where the Vault forgets itself. Use sparingly. Or do not.',
    category: 'anomaly',
    color: '#ff2a4d',
    emissive: '#ff0033',
    emissiveIntensity: 2.2,
    shader: 'glitch',
    stability: 0.2,
    anomaly: 1,
    metalness: 0,
    roughness: 0.5,
  },
  circuit: {
    id: 'circuit',
    name: 'Circuit Plate',
    loreName: 'Etched Cortex',
    description: 'PCB substrate alive with traffic. Connects neural nodes.',
    category: 'data',
    color: '#1a3d2e',
    emissive: '#39ff14',
    emissiveIntensity: 0.8,
    shader: 'circuit',
    stability: 0.9,
    anomaly: 0,
    metalness: 0.6,
    roughness: 0.55,
  },
  'power-line': {
    id: 'power-line',
    name: 'Power Line',
    loreName: 'Spinal Conduit',
    description: 'High-voltage neural conduit. Smart-connect snaps these into runs.',
    category: 'energy',
    color: '#ffb000',
    emissive: '#ffb000',
    emissiveIntensity: 2.4,
    stability: 0.85,
    anomaly: 0,
    metalness: 0.4,
    roughness: 0.3,
  },
  'neural-node': {
    id: 'neural-node',
    name: 'Neural Node',
    loreName: 'Synapse Beacon',
    description: 'A junction in the Vault\'s thought-graph. Anchors data streams.',
    category: 'data',
    color: '#7df9ff',
    emissive: '#00f9ff',
    emissiveIntensity: 3.0,
    shader: 'pulse-core',
    stability: 0.9,
    anomaly: 0,
    metalness: 0.3,
    roughness: 0.25,
  },
};

export const BLOCK_ORDER: BlockId[] = [
  'obsidian',
  'chrome',
  'corp-glass',
  'neon-cyan',
  'neon-magenta',
  'toxic-core',
  'data-stream',
  'holo-billboard',
  'circuit',
  'power-line',
  'neural-node',
  'glitch',
];

// ---------------------------------------------------------------------------
// V2 wire-format block index table.
//
// Stable ordering used by the worker's compact cell encoding (uint16: high
// byte = layer, low byte = block index). Index 0 is reserved for air.
//
// APPEND-ONLY contract: never reorder or remove entries — only add new
// BlockIds at the end. Re-numbering would invalidate every persisted OBS2
// vault.
// ---------------------------------------------------------------------------
export const BLOCK_INDEX_TABLE: ReadonlyArray<BlockId | null> = [
  null, // 0 — air / empty cell
  'obsidian', // 1
  'chrome', // 2
  'corp-glass', // 3
  'neon-cyan', // 4
  'neon-magenta', // 5
  'toxic-core', // 6
  'data-stream', // 7
  'holo-billboard', // 8
  'circuit', // 9
  'power-line', // 10
  'neural-node', // 11
  'glitch', // 12
];

const _blockIdToIndex = new Map<BlockId, number>();
for (let i = 1; i < BLOCK_INDEX_TABLE.length; i++) {
  const id = BLOCK_INDEX_TABLE[i];
  if (id) _blockIdToIndex.set(id, i);
}

/** BlockId -> wire index. Returns 0 (air) for null. Throws on unknown id. */
export function blockIdToIndex(id: BlockId | null): number {
  if (id === null) return 0;
  const idx = _blockIdToIndex.get(id);
  if (idx === undefined) {
    throw new Error(`Unknown BlockId "${id}" — missing from BLOCK_INDEX_TABLE`);
  }
  return idx;
}

/** Wire index -> BlockId. Returns null for 0 (air) or any unknown index. */
export function indexToBlockId(idx: number): BlockId | null {
  return BLOCK_INDEX_TABLE[idx] ?? null;
}

export const CATEGORY_ORDER: Array<{ id: import('@/types').BlockCategory; label: string }> = [
  { id: 'structure', label: 'STRUCTURE' },
  { id: 'neon', label: 'NEON' },
  { id: 'energy', label: 'ENERGY' },
  { id: 'data', label: 'DATA' },
  { id: 'anomaly', label: 'ANOMALY' },
];

export function getBlock(id: BlockId): BlockType {
  return BLOCK_TYPES[id];
}
