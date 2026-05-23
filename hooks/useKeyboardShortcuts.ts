'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { getEngine } from '@/hooks/useEngine';
import type { BrushMode } from '@/types';
import { savePromptDialog } from '@/lib/persistence';
import { generateContract, applyContract } from '@/lib/contracts';
import { newArtifactId } from '@/lib/artifacts';
import { rotateStampTransform, toggleMirrorX } from '@/lib/artifacts/transform';
import { toast } from 'sonner';

const MODE_KEYS: Record<string, BrushMode> = {
  KeyB: 'paint',
  KeyE: 'erase',
  KeyF: 'fill',
  KeyR: 'replace',
  KeyI: 'eyedropper',
  KeyX: 'select',
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't interfere with text inputs
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const ui = useUIStore.getState();

      // Shortcuts overlay — `?` (Shift+/) or `/`
      if ((e.key === '?' || e.key === '/') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        ui.togglePanel('shortcuts');
        return;
      }

      // Brush modes (skip when stamp mode consumes R/M)
      if (!ui.stampArtifact && MODE_KEYS[e.code]) {
        ui.setBrush({ mode: MODE_KEYS[e.code] });
        return;
      }

      // Stamp transform shortcuts (when stamp mode active)
      if (ui.stampArtifact) {
        if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
          const next = rotateStampTransform(ui.stampTransform);
          ui.setStampTransform(next);
          toast.message(`Stamp rotation: ${next.rotation * 90}°`);
          return;
        }
        if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
          const next = toggleMirrorX(ui.stampTransform);
          ui.setStampTransform(next);
          toast.message(next.mirrorX ? 'Mirror X on' : 'Mirror X off');
          return;
        }
      }

      // Brush size
      if (e.code === 'BracketLeft') { ui.setBrush({ size: Math.max(0, ui.brush.size - 1) }); return; }
      if (e.code === 'BracketRight') { ui.setBrush({ size: Math.min(8, ui.brush.size + 1) }); return; }

      // Camera
      if (e.code === 'Digit1') { ui.setCameraPreset('architect'); return; }
      if (e.code === 'Digit2') { ui.setCameraPreset('street'); return; }
      if (e.code === 'Digit3') { ui.setCameraPreset('neural-dive'); return; }
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) { ui.setScene({ cinematic: !ui.scene.cinematic }); return; }

      // Audio mute (not when stamp mode — M mirrors stamp)
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !ui.stampArtifact) {
        ui.setScene({ muted: !ui.scene.muted });
        toast.message(ui.scene.muted ? 'Audio engaged' : 'Audio muted');
        return;
      }

      // Panels
      if (e.code === 'KeyL') { ui.togglePanel('layers'); return; }
      if (e.code === 'KeyP') { ui.togglePanel('palette'); return; }
      if (e.code === 'KeyH') { ui.togglePanel('history'); return; }
      if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey) { ui.togglePanel('artifacts'); return; }

      // Contracts (immersive only)
      if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && ui.immersiveMode) {
        const c = generateContract();
        getEngine().setContract(c);
        applyContract(c);
        toast.success('CONTRACT ASSIGNED', { description: `${c.codename} — ${c.client}` });
        ui.setPanel('contract', true);
        return;
      }

      // Blueprint copy
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !e.shiftKey) {
        e.preventDefault();
        const { selectionStart, selectionEnd, setClipboard, clearSelection } = useUIStore.getState();
        if (!selectionStart || !selectionEnd) return;
        const [x0, y0, z0] = selectionStart;
        const [x1, y1, z1] = selectionEnd;
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
        const anchorX = Math.round((minX + maxX) / 2);
        const anchorY = minY;
        const anchorZ = Math.round((minZ + maxZ) / 2);
        const cells: import('@/lib/artifacts').ArtifactCell[] = [];
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              const blockId = getEngine().getBlock(x, y, z);
              if (blockId) cells.push({ dx: x - anchorX, dy: y - anchorY, dz: z - anchorZ, blockId, layer: y });
            }
          }
        }
        if (!cells.length) return;
        const artifact: import('@/lib/artifacts').Artifact = {
          id: newArtifactId(),
          name: 'Blueprint',
          type: 'blueprint',
          anchor: [anchorX, anchorY, anchorZ],
          cells,
          createdAt: Date.now(),
        };
        setClipboard(artifact);
        clearSelection();
        toast.success(`Copied ${cells.length} cells`);
        return;
      }

      // Blueprint paste
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        e.preventDefault();
        const { clipboard, hoverCell } = useUIStore.getState();
        if (!clipboard) return;
        const [ax, ay, az] = hoverCell ?? clipboard.anchor;
        const activeLayer = getEngine().getActiveLayer();
        const soloLayer = getEngine().getLayers().find((l) => l.solo)?.id;
        getEngine().applyOps(
          clipboard.cells.map((c) => ({
            x: ax + c.dx,
            y: ay + c.dy,
            z: az + c.dz,
            blockId: c.blockId,
            layer: soloLayer !== undefined ? activeLayer : c.layer,
          })),
          `Paste ${clipboard.name}`,
        );
        toast.success(`Pasted "${clipboard.name}"`);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) getEngine().redo();
        else getEngine().undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        getEngine().redo();
        return;
      }

      // Save
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        savePromptDialog();
        return;
      }

      // Escape: cancel stamp, clear selection, close shortcuts
      if (e.code === 'Escape') {
        if (ui.stampArtifact) {
          ui.setStampArtifact(null);
          ui.resetStampTransform();
          return;
        }
        if (ui.selectionStart) {
          ui.clearSelection();
          return;
        }
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
