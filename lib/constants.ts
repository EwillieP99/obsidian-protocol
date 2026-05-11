// World dimensions
export const WORLD_SIZE = 48; // x and z extents (cells)
export const WORLD_HEIGHT = 12; // number of vertical layers
export const HALF = WORLD_SIZE / 2;

// Cell size in world units
export const CELL = 1;

// Grid floor
export const FLOOR_Y = -0.5; // bottom face of layer 0 sits on this y

// V2 chunking. The engine subdivides the world into 16³ chunks. Y is rounded
// up to a multiple of CHUNK_SIZE so the chunk grid stays cube-shaped — the
// upper 4 layers (y >= WORLD_HEIGHT) are unused but cheap.
export const CHUNK_SIZE = 16;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE; // 4096
export const WORLD_Y_ROUNDED = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE) * CHUNK_SIZE; // 16

// Maximum instances per InstancedMesh. Sized for ~10× V1's typical voxel
// count so we never reallocate mid-session.
export const MAX_INSTANCES = 16384;

// Engine history capacity (mirrors HISTORY_LIMIT below; named for engine use).
export const ENGINE_CHRONO_LIMIT = 100;

// Stats tick cadence — how often the voxel worker recomputes integrity /
// anomaly / cellCount and emits STATS. Drives the HUD update rate.
export const STATS_TICK_MS = 200;

// V2 storage keys (V1 keys preserved below for migration discovery).
export const SAVE_DB_KEY = 'obsidian-protocol-saves-v1';
export const PREFS_KEY = 'obsidian-protocol-prefs-v1';
export const AUTOSAVE_KEY = 'obsidian-protocol-autosave-v1';
export const AUTOSAVE_KEY_V2 = 'obsidian-protocol-autosave-v2';
export const SAVE_DB_KEY_V2 = 'obsidian-protocol-saves-v2';

// History
export const HISTORY_LIMIT = 100;

// Camera presets
export const CAMERA_PRESETS = {
  architect: { position: [32, 28, 32] as [number, number, number], target: [0, 4, 0] as [number, number, number], fov: 45 },
  street: { position: [14, 1.6, 18] as [number, number, number], target: [0, 4, 0] as [number, number, number], fov: 65 },
  'neural-dive': { position: [4, 18, 4] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 80 },
  orbit: { position: [24, 20, 24] as [number, number, number], target: [0, 4, 0] as [number, number, number], fov: 50 },
};

// Keyboard shortcuts
export const SHORTCUTS = {
  paint: 'B',
  erase: 'E',
  fill: 'F',
  replace: 'R',
  eyedropper: 'I',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  cinematic: 'C',
  architect: '1',
  street: '2',
  'neural-dive': '3',
  toggleLayer: 'L',
  togglePalette: 'P',
  newContract: 'N',
  save: 'Ctrl+S',
  brushSizeUp: ']',
  brushSizeDown: '[',
} as const;
