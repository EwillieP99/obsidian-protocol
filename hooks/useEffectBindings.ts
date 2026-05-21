'use client';

import { useEffect } from 'react';
import { getEngine } from '@/hooks/useEngine';
import { useEffectsStore } from '@/stores/effectsStore';
import { useUIStore } from '@/stores/uiStore';
import { BLOCK_TYPES } from '@/lib/blocks';
import {
  playEraseGlitch, playLargeFillThump, playNeonHum, playPlaceClick, setMuted, setVolume,
} from '@/lib/audio';

export function useEffectBindings() {
  // Keep audio module synced with UI mute/volume.
  useEffect(() => {
    const sync = () => {
      const s = useUIStore.getState().scene;
      setMuted(s.muted);
      setVolume(s.volume);
    };
    sync();
    const unsub = useUIStore.subscribe(sync);
    return () => unsub();
  }, []);

  useEffect(() => {
    return getEngine().on('patch', (e) => {
      // Skip particle/audio effects for vault loads.
      if (e.clearBeforeApply) return;

      const fx = useEffectsStore.getState();
      const quality = useUIStore.getState().scene.quality;
      const particlesEnabled = quality !== 'performance';

      const isUndo = e.label.startsWith('Undo: ');
      const isRedo = e.label.startsWith('Redo: ');

      if (isUndo) {
        const keys = e.deltas.map((d) => `${d.x},${d.y},${d.z}`).slice(0, 96);
        fx.highlightCells(keys, '#ff00aa', 700);
        return;
      }

      if (isRedo) {
        const keys = e.deltas.map((d) => `${d.x},${d.y},${d.z}`).slice(0, 96);
        fx.highlightCells(keys, '#00f9ff', 700);
        return;
      }

      // Fresh placement / erase / fill
      const placedCells: Array<[number, number, number]> = [];
      const erasedCells: Array<[number, number, number]> = [];
      let placedColor = '#00f9ff';

      for (const d of e.deltas) {
        if (d.newBlockId !== null) {
          placedCells.push([d.x, d.y, d.z]);
          placedColor = (BLOCK_TYPES[d.newBlockId] as { emissive?: string } | undefined)?.emissive ?? placedColor;
        } else if (d.prevBlockId !== null) {
          erasedCells.push([d.x, d.y, d.z]);
        }
      }

      if (particlesEnabled) {
        if (placedCells.length > 0) {
          const sample = placedCells.length > 80 ? sampleEvenly(placedCells, 80) : placedCells;
          fx.spawnPlacementBurst(sample, placedColor, 'place');
        }
        if (erasedCells.length > 0) {
          const sample = erasedCells.length > 80 ? sampleEvenly(erasedCells, 80) : erasedCells;
          fx.spawnPlacementBurst(sample, '#ff2a4d', 'erase');
        }
      }

      const total = e.deltas.length;
      const isLarge = total >= 16;
      const isHuge = total >= 64;
      if (placedCells.length > 0) {
        playPlaceClick(0.92 + Math.random() * 0.16);
        if (isLarge) playNeonHum(0.95 + Math.random() * 0.1);
      }
      if (erasedCells.length > 0) {
        playEraseGlitch();
      }
      if (isHuge) {
        playLargeFillThump();
        fx.pushShake(Math.min(0.9, 0.3 + total / 400));
        fx.pulseBloom(1.6 + Math.min(1.2, total / 200));
      } else if (isLarge) {
        fx.pushShake(0.18);
        fx.pulseBloom(1.25);
      }
    });
  }, []);
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}
