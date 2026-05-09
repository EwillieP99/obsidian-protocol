'use client';

import { create } from 'zustand';
import type { BlockId, Brush, CameraPreset, SceneSettings } from '@/types';

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

  // Panels
  panels: {
    palette: boolean;
    layers: boolean;
    history: boolean;
    contract: boolean;
    settings: boolean;
    shortcuts: boolean;
  };
  togglePanel: (k: keyof UIState['panels']) => void;
  setPanel: (k: keyof UIState['panels'], v: boolean) => void;

  // Loading transition (e.g. when a save is being applied)
  loading: string | null; // message
  setLoading: (s: string | null) => void;

  // Camera
  cameraPreset: CameraPreset;
  setCameraPreset: (c: CameraPreset) => void;

  // Scene settings
  scene: SceneSettings;
  setScene: (s: Partial<SceneSettings>) => void;

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
}

export const useUIStore = create<UIState>((set, get) => ({
  booted: false,
  setBooted: (b) => set({ booted: b }),

  activeBlock: 'neon-cyan',
  setActiveBlock: (b) => set({ activeBlock: b }),

  brush: {
    size: 0,
    shape: 'cube',
    mode: 'paint',
    randomness: 0,
    smartConnect: false,
  },
  setBrush: (b) => set({ brush: { ...get().brush, ...b } }),

  hoverCell: null,
  hoverNormal: null,
  setHover: (cell, normal) => set({ hoverCell: cell, hoverNormal: normal }),

  panels: {
    palette: true,
    layers: true,
    history: false,
    contract: false,
    settings: false,
    shortcuts: false,
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
  setScene: (s) => set({ scene: { ...get().scene, ...s } }),

  fps: 0,
  setFps: (n) => set({ fps: n }),

  memoryMB: 0,
  setMemoryMB: (n) => set({ memoryMB: n }),

  rendererMode: 'webgl',
  setRendererMode: (m) => set({ rendererMode: m }),

  anomalyAlert: null,
  setAnomalyAlert: (s) => set({ anomalyAlert: s }),
}));
