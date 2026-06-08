'use client';

import { create } from 'zustand';
import type { BlockId, Brush, CameraPreset, SceneSettings } from '@/types';
import {
  detectActivePreset,
  getSettingsPreset,
  type SettingsPresetId,
  type UITheme,
} from '@/lib/settingsPresets';
import { saveSettings } from '@/lib/settingsPersistence';

export type { UITheme };

interface UIState {
  // Boot
  booted: boolean;
  setBooted: (b: boolean) => void;

  // Active block + brush
  activeBlock: BlockId;
  setActiveBlock: (b: BlockId) => void;

  brush: Brush;
  setBrush: (b: Partial<Brush>) => void;

  // Hover preview
  hoverCell: [number, number, number] | null;
  hoverNormal: [number, number, number] | null;
  setHover: (cell: [number, number, number] | null, normal: [number, number, number] | null) => void;

  // Line-stroke preview (Interaction → Cursor). An ordered list of vertices:
  // a single A→B line has 2, a corner-locked polyline has 3+.
  strokePreviewPath: [number, number, number][] | null;
  setStrokePreview: (path: [number, number, number][] | null) => void;
  clearStrokePreview: () => void;

  // Panels
  panels: {
    palette: boolean;
    layers: boolean;
    history: boolean;
    contract: boolean;
    settings: boolean;
    shortcuts: boolean;
    artifacts: boolean;
  };
  togglePanel: (k: keyof UIState['panels']) => void;
  setPanel: (k: keyof UIState['panels'], v: boolean) => void;

  // Artifact stamp mode
  stampArtifact: import('@/lib/artifacts').Artifact | null;
  setStampArtifact: (a: import('@/lib/artifacts').Artifact | null) => void;
  stampTransform: import('@/lib/artifacts/transform').StampTransform;
  setStampTransform: (t: Partial<import('@/lib/artifacts/transform').StampTransform>) => void;
  resetStampTransform: () => void;

  // Loading transition (e.g. when a save is being applied)
  loading: string | null; // message
  setLoading: (s: string | null) => void;

  // Camera
  cameraPreset: CameraPreset;
  setCameraPreset: (c: CameraPreset) => void;

  // Scene settings
  scene: SceneSettings;
  setScene: (s: Partial<SceneSettings>) => void;

  // Interface theme — live design tokens applied to :root
  theme: UITheme;
  setTheme: (t: Partial<UITheme>) => void;

  // Settings presets — one-click scene + theme bundles
  activeSettingsPreset: SettingsPresetId | null;
  applySettingsPreset: (id: SettingsPresetId) => void;
  hydrateSettings: (saved: import('@/lib/settingsPersistence').PersistedSettings) => void;

  // FPS
  fps: number;
  setFps: (n: number) => void;

  // Memory estimate (MB)
  memoryMB: number;
  setMemoryMB: (n: number) => void;

  // Renderer mode (actual support detected at runtime)
  rendererMode: 'webgl' | 'webgpu';
  setRendererMode: (m: 'webgl' | 'webgpu') => void;

  // Anomalies
  anomalyAlert: string | null;
  setAnomalyAlert: (s: string | null) => void;

  // Immersive Mode — off by default; enables integrity meter, anomaly alerts, contract prominence
  immersiveMode: boolean;
  setImmersiveMode: (v: boolean) => void;

  // Region selection (for blueprint clipboard)
  selectionStart: [number, number, number] | null;
  selectionEnd: [number, number, number] | null;
  setSelectionStart: (c: [number, number, number] | null) => void;
  setSelectionEnd: (c: [number, number, number] | null) => void;
  clearSelection: () => void;

  // Clipboard (in-memory artifact ready to paste)
  clipboard: import('@/lib/artifacts').Artifact | null;
  setClipboard: (a: import('@/lib/artifacts').Artifact | null) => void;

  // Autosave indicator
  lastSavedAt: number | null;
  setLastSavedAt: (t: number | null) => void;
  lastSaveError: string | null;
  setLastSaveError: (msg: string | null) => void;

  // Engine health (worker spawn / READY failures)
  engineDegraded: boolean;
  setEngineDegraded: (v: boolean) => void;
  toolbarGroups: {
    brushModes: boolean;
    brushSize: boolean;
    history: boolean;
    camera: boolean;
    panels: boolean;
    clipboard: boolean;
    io: boolean;
  };
  toggleToolbarGroup: (k: keyof UIState['toolbarGroups']) => void;
}

function snapshotForPreset(get: () => UIState) {
  const { scene, theme, immersiveMode } = get();
  return { scene, theme, immersiveMode };
}

function persistSettingsState(get: () => UIState) {
  const { scene, theme, immersiveMode, activeSettingsPreset } = get();
  saveSettings({ scene, theme, immersiveMode, activeSettingsPreset });
}

function syncPresetHighlight(set: (partial: Partial<UIState>) => void, get: () => UIState) {
  const detected = detectActivePreset(snapshotForPreset(get));
  if (get().activeSettingsPreset !== detected) {
    set({ activeSettingsPreset: detected });
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  booted: false,
  setBooted: (b) => set({ booted: b }),

  activeBlock: 'neon-cyan',
  setActiveBlock: (b) => set({ activeBlock: b }),

  brush: {
    size: 0,
    shape: 'rectangle',
    stroke: 'freehand',
    mode: 'paint',
    randomness: 0,
    smartConnect: false,
  },
  setBrush: (b) => {
    const merged = { ...get().brush, ...b };
    const raw = merged.shape as string;
    if (raw === 'sphere') merged.shape = 'circle';
    else if (raw === 'cube' || raw === 'plane') merged.shape = 'rectangle';
    set({ brush: merged });
  },

  hoverCell: null,
  hoverNormal: null,
  setHover: (cell, normal) => set({ hoverCell: cell, hoverNormal: normal }),

  strokePreviewPath: null,
  setStrokePreview: (path) => set({ strokePreviewPath: path }),
  clearStrokePreview: () => set({ strokePreviewPath: null }),

  panels: {
    palette: true,
    layers: true,
    history: false,
    contract: false,
    settings: false,
    shortcuts: false,
    artifacts: false,
  },
  togglePanel: (k) => set({ panels: { ...get().panels, [k]: !get().panels[k] } }),
  setPanel: (k, v) => set({ panels: { ...get().panels, [k]: v } }),

  loading: null,
  setLoading: (s) => set({ loading: s }),

  cameraPreset: 'architect',
  setCameraPreset: (c) => set({ cameraPreset: c }),

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
  setScene: (s) => {
    set({ scene: { ...get().scene, ...s } });
    syncPresetHighlight(set, get);
    persistSettingsState(get);
  },

  theme: {
    accent: '#38e1ff',
    magenta: '#ff2e88',
    amber: '#ffb547',
    green: '#5cffaf',
    density: 'regular',
    chrome: 'full',
    contrast: 'normal',
  },
  setTheme: (t) => {
    set({ theme: { ...get().theme, ...t } });
    syncPresetHighlight(set, get);
    persistSettingsState(get);
  },

  activeSettingsPreset: 'studio',
  applySettingsPreset: (id) => {
    const preset = getSettingsPreset(id);
    set({
      scene: { ...get().scene, ...preset.scene },
      theme: { ...get().theme, ...preset.theme },
      immersiveMode: preset.immersiveMode,
      activeSettingsPreset: id,
    });
    persistSettingsState(get);
  },
  hydrateSettings: (saved) => {
    const next: Partial<UIState> = {};
    if (saved.scene) next.scene = { ...get().scene, ...saved.scene };
    if (saved.theme) next.theme = { ...get().theme, ...saved.theme };
    if (saved.immersiveMode !== undefined) next.immersiveMode = saved.immersiveMode;
    set(next);
    const detected = detectActivePreset(snapshotForPreset(get));
    set({ activeSettingsPreset: saved.activeSettingsPreset ?? detected });
  },

  fps: 0,
  setFps: (n) => set({ fps: n }),

  memoryMB: 0,
  setMemoryMB: (n) => set({ memoryMB: n }),

  rendererMode: 'webgl',
  setRendererMode: (m) => set({ rendererMode: m }),

  anomalyAlert: null,
  setAnomalyAlert: (s) => set({ anomalyAlert: s }),

  immersiveMode: false,
  setImmersiveMode: (v) => {
    set({ immersiveMode: v });
    syncPresetHighlight(set, get);
    persistSettingsState(get);
  },

  selectionStart: null,
  selectionEnd: null,
  setSelectionStart: (c) => set({ selectionStart: c }),
  setSelectionEnd: (c) => set({ selectionEnd: c }),
  clearSelection: () => set({ selectionStart: null, selectionEnd: null }),

  clipboard: null,
  setClipboard: (a) => set({ clipboard: a }),

  stampArtifact: null,
  setStampArtifact: (a) => set({ stampArtifact: a, stampTransform: a ? get().stampTransform : { rotation: 0, mirrorX: false, mirrorZ: false } }),
  stampTransform: { rotation: 0, mirrorX: false, mirrorZ: false },
  setStampTransform: (t) => set({ stampTransform: { ...get().stampTransform, ...t } }),
  resetStampTransform: () => set({ stampTransform: { rotation: 0, mirrorX: false, mirrorZ: false } }),

  lastSavedAt: null,
  setLastSavedAt: (t) => set({ lastSavedAt: t }),
  lastSaveError: null,
  setLastSaveError: (msg) => set({ lastSaveError: msg }),
  engineDegraded: false,
  setEngineDegraded: (v) => set({ engineDegraded: v }),

  toolbarGroups: {
    brushModes: false,
    brushSize: false,
    history: false,
    camera: false,
    panels: false,
    clipboard: false,
    io: false,
  },
  toggleToolbarGroup: (k) =>
    set({ toolbarGroups: { ...get().toolbarGroups, [k]: !get().toolbarGroups[k] } }),
}));
