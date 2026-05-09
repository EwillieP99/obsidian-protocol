// World dimensions
export const WORLD_SIZE = 48; // x and z extents (cells)
export const WORLD_HEIGHT = 12; // number of vertical layers
export const HALF = WORLD_SIZE / 2;

// Cell size in world units
export const CELL = 1;

// Grid floor
export const FLOOR_Y = -0.5; // bottom face of layer 0 sits on this y

// Storage keys
export const SAVE_DB_KEY = 'obsidian-protocol-saves-v1';
export const PREFS_KEY = 'obsidian-protocol-prefs-v1';
export const AUTOSAVE_KEY = 'obsidian-protocol-autosave-v1';

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
