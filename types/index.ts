export type Vec3 = [number, number, number];

export type BlockId =
  | 'obsidian'
  | 'chrome'
  | 'neon-cyan'
  | 'neon-magenta'
  | 'neon-amber'
  | 'neon-lime'
  | 'neon-violet'
  | 'toxic-core'
  | 'data-stream'
  | 'holo-billboard'
  | 'glitch'
  | 'corp-glass'
  | 'circuit'
  | 'power-line'
  | 'neural-node'
  | 'carbon';

export type BlockCategory = 'structure' | 'neon' | 'energy' | 'data' | 'anomaly';

export interface BlockType {
  id: BlockId;
  name: string;
  loreName: string;
  description: string;
  category: BlockCategory;
  /** Hex color (used for swatch + base material). */
  color: string;
  /** Emissive hex; if 0 the block doesn't glow. */
  emissive: string;
  emissiveIntensity: number;
  /** Whether this block uses a custom shader (handled in scene). */
  shader?: 'pulse-core' | 'holo' | 'data-waterfall' | 'glitch' | 'circuit';
  /** Stability rating; combined with anomaly rating to compute Neural Integrity. */
  stability: number;
  /** 0–1, how much this block destabilizes the vault. */
  anomaly: number;
  metalness: number;
  roughness: number;
  transparent?: boolean;
  opacity?: number;
}

export interface VoxelLayer {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  /** Display order in the panel (independent of y). Defaults to id. */
  order?: number;
  /** 0..1 per-layer opacity multiplier. Defaults to 1. */
  opacity?: number;
}

export interface VoxelMap {
  /** Sparse map keyed by `${x},${y},${z}` -> BlockId */
  cells: Record<string, BlockId>;
}

export type BrushShape = 'rectangle' | 'circle';
export type BrushStroke = 'freehand' | 'line';
export type BrushMode = 'paint' | 'erase' | 'fill' | 'replace' | 'eyedropper' | 'select';

export interface Brush {
  size: number; // radius in cells (0 = single block)
  shape: BrushShape;
  stroke: BrushStroke;
  mode: BrushMode;
  /** 0–1: chance to skip a cell, makes brushes feel organic. */
  randomness: number;
  /** When true, snap power-line / circuit blocks into orthogonal runs. */
  smartConnect: boolean;
}

export type CameraPreset = 'architect' | 'street' | 'neural-dive' | 'orbit';

export type QualityPreset = 'high' | 'balanced' | 'performance';

export interface SceneSettings {
  bloomIntensity: number;
  chromaticAberration: number;
  scanlines: boolean;
  glitchEffect: boolean;
  vignette: boolean;
  /** Number of background "data drone" sprites animating through the scene. */
  ambientDrones: number;
  /** Auto-rotate camera. */
  cinematic: boolean;
  /** Render-quality preset that adjusts bloom/postprocessing/particles. */
  quality: QualityPreset;
  /** Auto-degrade to lower quality if FPS drops. */
  autoDegrade: boolean;
  /** Show FPS readout in the status bar. */
  showFps: boolean;
  /** Audio mute. */
  muted: boolean;
  /** Master volume (0..1). */
  volume: number;
}

export interface SerializedSave {
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string; // data URL
  bounds: { min: Vec3; max: Vec3 };
  layers: VoxelLayer[];
  cells: Array<[number, number, number, BlockId]>;
  contract?: Contract;
}

export interface Contract {
  id: string;
  client: string;
  codename: string;
  brief: string;
  payout: number;
  hazard: 'low' | 'medium' | 'high' | 'critical';
  seed: number;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  thumbnail?: string;
  /** Patch: prev cells -> next cells, sparse. null = remove */
  patch: Array<[string, BlockId | null, BlockId | null]>; // [key, before, after]
}
