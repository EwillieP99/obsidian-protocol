import type { SceneSettings } from '@/types';
import type { SettingsPresetId, UITheme } from '@/lib/settingsPresets';

const STORAGE_KEY = 'op:settings:v1';

export interface PersistedSettings {
  scene?: Partial<SceneSettings>;
  theme?: Partial<UITheme>;
  immersiveMode?: boolean;
  activeSettingsPreset?: SettingsPresetId | null;
}

export function saveSettings(data: PersistedSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function loadSettings(): PersistedSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSettings;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}
