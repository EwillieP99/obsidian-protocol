'use client';

import { useEffect, useRef } from 'react';
import { useVoxelStore } from '@/stores/voxelStore';
import { useEffectsStore } from '@/stores/effectsStore';
import { useUIStore } from '@/stores/uiStore';
import { BLOCK_TYPES } from '@/lib/blocks';
import {
  playEraseGlitch, playLargeFillThump, playNeonHum, playPlaceClick, setMuted, setVolume,
} from '@/lib/audio';
import { unkey } from '@/lib/utils';

/**
 * Subscribes to voxel-store revisions and fires:
 *  - Particles at the freshly-changed cells
 *  - Audio (place click, erase glitch, large-fill thump)
 *  - Screen shake + bloom flash on big batches
 *  - Cell highlight on undo/redo
 *
 * We diff via the latest history entry: if `revision` increased and
 * `history.length` increased, that history entry is "fresh" — we use its patch.
 * If `future.length` increased, an undo just happened. If both `history.length`
 * grew AND `future.length` shrank, redo.
 */
export function useEffectBindings() {
  const lastRevision = useRef<number>(useVoxelStore.getState().revision);
  const lastHistoryLen = useRef<number>(useVoxelStore.getState().history.length);
  const lastFutureLen = useRef<number>(useVoxelStore.getState().future.length);

  // Keep audio module synced with UI mute/volume
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
    const unsub = useVoxelStore.subscribe((state) => {
      if (state.revision === lastRevision.current) return;
      lastRevision.current = state.revision;

      const fx = useEffectsStore.getState();
      const ui = useUIStore.getState();
      const quality = ui.scene.quality;
      const particlesEnabled = quality !== 'performance';

      const hLen = state.history.length;
      const fLen = state.future.length;
      const grewHistory = hLen > lastHistoryLen.current;
      const grewFuture = fLen > lastFutureLen.current;
      const shrankFuture = fLen < lastFutureLen.current;
      lastHistoryLen.current = hLen;
      lastFutureLen.current = fLen;

      if (grewFuture) {
        // Undo: reverted entry is the freshest in `future`
        const entry = state.future[fLen - 1];
        if (!entry) return;
        const keys = entry.patch.map(([k]) => k).slice(0, 96);
        fx.highlightCells(keys, '#ff00aa', 700);
      } else if (grewHistory && shrankFuture) {
        // Redo
        const entry = state.history[hLen - 1];
        if (!entry) return;
        const keys = entry.patch.map(([k]) => k).slice(0, 96);
        fx.highlightCells(keys, '#00f9ff', 700);
      } else if (grewHistory) {
        // Fresh placement / erase / fill
        const entry = state.history[hLen - 1];
        if (!entry) return;
        const placedCells: Array<[number, number, number]> = [];
        const erasedCells: Array<[number, number, number]> = [];
        let placedColor = '#00f9ff';
        for (const [k, before, after] of entry.patch) {
          const cell = unkey(k);
          if (after) {
            placedCells.push(cell);
            placedColor = BLOCK_TYPES[after]?.emissive ?? placedColor;
          } else if (before) {
            erasedCells.push(cell);
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

        // Audio + screen shake heuristics
        const total = entry.patch.length;
        const isLarge = total >= 16;
        const isHuge = total >= 64;
        if (placedCells.length > 0) {
          // Pitch jitter avoids monotonous "click-click-click" on continuous drag
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
      }
    });
    return () => unsub();
  }, []);
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}
