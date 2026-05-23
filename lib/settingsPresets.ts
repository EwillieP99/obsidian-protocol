import type { SceneSettings } from '@/types';

export type SettingsPresetId = 'studio' | 'neon' | 'performance' | 'immersive';

export interface UITheme {
  accent: string;
  magenta: string;
  amber: string;
  green: string;
  density: 'compact' | 'regular';
  chrome: 'minimal' | 'full';
  contrast: 'normal' | 'high';
}

export interface SettingsPreset {
  id: SettingsPresetId;
  name: string;
  label: string;
  tip: string;
  scene: Partial<SceneSettings>;
  theme: Partial<UITheme>;
  immersiveMode: boolean;
}

/** Coordinated UI color tuples — shared by settings presets. */
export const THEME_PALETTES = {
  azure: { accent: '#38e1ff', magenta: '#ff2e88', amber: '#ffb547', green: '#5cffaf' },
  synthwave: { accent: '#a25cff', magenta: '#ff2e88', amber: '#ffb547', green: '#5cffaf' },
  ember: { accent: '#ffb547', magenta: '#ff5c6c', amber: '#ffd23f', green: '#5cffaf' },
} as const;

export const SETTINGS_PRESETS: SettingsPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    label: 'STUDIO',
    tip: 'Default creative builder — high quality, Azure UI theme, immersive off.',
    immersiveMode: false,
    scene: {
      bloomIntensity: 1.1,
      chromaticAberration: 0.0015,
      scanlines: true,
      glitchEffect: false,
      vignette: true,
      ambientDrones: 12,
      cinematic: false,
      quality: 'high',
      autoDegrade: true,
      showFps: true,
      muted: false,
      volume: 0.35,
    },
    theme: {
      ...THEME_PALETTES.azure,
      density: 'regular',
      chrome: 'full',
      contrast: 'normal',
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    label: 'NEON',
    tip: 'Max cyberpunk — Synthwave UI, boosted bloom, extra ambient drones.',
    immersiveMode: false,
    scene: {
      bloomIntensity: 1.4,
      chromaticAberration: 0.002,
      scanlines: true,
      glitchEffect: false,
      vignette: true,
      ambientDrones: 24,
      cinematic: false,
      quality: 'high',
      autoDegrade: true,
      showFps: true,
      muted: false,
      volume: 0.35,
    },
    theme: {
      ...THEME_PALETTES.synthwave,
      density: 'regular',
      chrome: 'full',
      contrast: 'normal',
    },
  },
  {
    id: 'performance',
    name: 'Performance',
    label: 'PERF',
    tip: 'Low-end GPU — minimal post-FX, fewer drones, performance quality tier.',
    immersiveMode: false,
    scene: {
      bloomIntensity: 0.7,
      chromaticAberration: 0.0008,
      scanlines: false,
      glitchEffect: false,
      vignette: false,
      ambientDrones: 4,
      cinematic: false,
      quality: 'performance',
      autoDegrade: true,
      showFps: true,
      muted: false,
      volume: 0.35,
    },
    theme: {
      ...THEME_PALETTES.azure,
      density: 'regular',
      chrome: 'minimal',
      contrast: 'normal',
    },
  },
  {
    id: 'immersive',
    name: 'Immersive',
    label: 'IMMERSIVE',
    tip: 'Lore layer on — integrity meter, contracts, Ember UI, balanced quality.',
    immersiveMode: true,
    scene: {
      bloomIntensity: 1.1,
      chromaticAberration: 0.0015,
      scanlines: true,
      glitchEffect: false,
      vignette: true,
      ambientDrones: 12,
      cinematic: false,
      quality: 'balanced',
      autoDegrade: true,
      showFps: true,
      muted: false,
      volume: 0.35,
    },
    theme: {
      ...THEME_PALETTES.ember,
      density: 'regular',
      chrome: 'full',
      contrast: 'normal',
    },
  },
];

export function getSettingsPreset(id: SettingsPresetId): SettingsPreset {
  const preset = SETTINGS_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown settings preset: ${id}`);
  return preset;
}

function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function partialMatches<T extends object>(current: T, partial: Partial<T>): boolean {
  for (const key of Object.keys(partial) as Array<keyof T>) {
    const expected = partial[key];
    const actual = current[key];
    if (typeof expected === 'string' && typeof actual === 'string' && expected.startsWith('#')) {
      if (!sameColor(expected, actual)) return false;
    } else if (typeof expected === 'number' && typeof actual === 'number') {
      if (Math.abs(expected - actual) > 0.0001) return false;
    } else if (expected !== actual) {
      return false;
    }
  }
  return true;
}

export interface SettingsSnapshot {
  scene: SceneSettings;
  theme: UITheme;
  immersiveMode: boolean;
}

/** Returns preset id when current state exactly matches a preset's defined fields. */
export function detectActivePreset(snapshot: SettingsSnapshot): SettingsPresetId | null {
  for (const preset of SETTINGS_PRESETS) {
    if (snapshot.immersiveMode !== preset.immersiveMode) continue;
    if (!partialMatches(snapshot.scene, preset.scene)) continue;
    if (!partialMatches(snapshot.theme, preset.theme)) continue;
    return preset.id;
  }
  return null;
}
