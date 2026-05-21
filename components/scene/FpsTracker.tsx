'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { getEngine } from '@/hooks/useEngine';

/**
 * Samples FPS every ~500ms, updates the UI store, and feeds an auto-degrade
 * heuristic: if FPS sustains below 38 for 3 consecutive samples while quality
 * is "high", drop to "balanced". If still below 32 sustained, drop to
 * "performance". Lifts back when sustained > 56.
 */
export function FpsTracker() {
  const last = useRef(performance.now());
  const acc = useRef(0);
  const frames = useRef(0);
  const lowSamples = useRef(0);
  const highSamples = useRef(0);

  // Memory readout (Chromium only — `performance.memory` is non-standard).
  useEffect(() => {
    const id = setInterval(() => {
      const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMem) {
        useUIStore.getState().setMemoryMB(perfMem.usedJSHeapSize / (1024 * 1024));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useFrame(() => {
    const now = performance.now();
    const delta = now - last.current;
    last.current = now;
    acc.current += delta;
    frames.current += 1;
    if (acc.current >= 500) {
      const fps = Math.round((frames.current * 1000) / acc.current);
      useUIStore.getState().setFps(fps);
      acc.current = 0;
      frames.current = 0;

      // Auto-degrade
      const ui = useUIStore.getState();
      if (!ui.scene.autoDegrade) {
        lowSamples.current = 0;
        highSamples.current = 0;
        return;
      }
      const hasManyVoxels = getEngine().getStats().cellCount > 800;
      // Only auto-degrade when there's enough scene to justify it.
      if (!hasManyVoxels) return;

      if (fps < 38) {
        lowSamples.current += 1;
        highSamples.current = 0;
      } else if (fps > 56) {
        highSamples.current += 1;
        lowSamples.current = 0;
      } else {
        lowSamples.current = 0;
        highSamples.current = 0;
      }
      if (lowSamples.current >= 3) {
        const cur = ui.scene.quality;
        const next = cur === 'high' ? 'balanced' : cur === 'balanced' ? 'performance' : null;
        if (next) {
          ui.setScene({ quality: next });
          lowSamples.current = 0;
        }
      }
      if (highSamples.current >= 8) {
        const cur = ui.scene.quality;
        const next = cur === 'performance' ? 'balanced' : cur === 'balanced' ? 'high' : null;
        if (next) {
          ui.setScene({ quality: next });
          highSamples.current = 0;
        }
      }
    }
  });
  return null;
}
