'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useVoxelStore } from '@/stores/voxelStore';
import type { BrushMode } from '@/types';
import { savePromptDialog } from '@/lib/persistence';
import { generateContract, applyContract } from '@/lib/contracts';
import { toast } from 'sonner';

const MODE_KEYS: Record<string, BrushMode> = {
  KeyB: 'paint',
  KeyE: 'erase',
  KeyF: 'fill',
  KeyR: 'replace',
  KeyI: 'eyedropper',
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't interfere with text inputs
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const ui = useUIStore.getState();
      const vx = useVoxelStore.getState();

      // Shortcuts overlay — `?` (Shift+/) or `/`
      if ((e.key === '?' || e.key === '/') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        ui.togglePanel('shortcuts');
        return;
      }

      // Brush modes
      if (MODE_KEYS[e.code]) {
        ui.setBrush({ mode: MODE_KEYS[e.code] });
        return;
      }

      // Brush size
      if (e.code === 'BracketLeft') { ui.setBrush({ size: Math.max(0, ui.brush.size - 1) }); return; }
      if (e.code === 'BracketRight') { ui.setBrush({ size: Math.min(8, ui.brush.size + 1) }); return; }

      // Camera
      if (e.code === 'Digit1') { ui.setCameraPreset('architect'); return; }
      if (e.code === 'Digit2') { ui.setCameraPreset('street'); return; }
      if (e.code === 'Digit3') { ui.setCameraPreset('neural-dive'); return; }
      if (e.code === 'KeyC') { ui.setScene({ cinematic: !ui.scene.cinematic }); return; }

      // Audio mute
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
        ui.setScene({ muted: !ui.scene.muted });
        toast.message(ui.scene.muted ? 'Audio engaged' : 'Audio muted');
        return;
      }

      // Panels
      if (e.code === 'KeyL') { ui.togglePanel('layers'); return; }
      if (e.code === 'KeyP') { ui.togglePanel('palette'); return; }
      if (e.code === 'KeyH') { ui.togglePanel('history'); return; }

      // Contracts
      if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey) {
        const c = generateContract();
        vx.setContract(c);
        applyContract(c);
        toast.success('CONTRACT ASSIGNED', { description: `${c.codename} — ${c.client}` });
        ui.setPanel('contract', true);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) vx.redo();
        else vx.undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        vx.redo();
        return;
      }

      // Save
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        savePromptDialog();
        return;
      }

      // Escape closes shortcuts overlay if open
      if (e.code === 'Escape') {
        if (ui.panels.shortcuts) {
          ui.setPanel('shortcuts', false);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
