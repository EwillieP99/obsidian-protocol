'use client';

import { useUIStore } from '@/stores/uiStore';
import { useEngineLayers, useEngineContract } from '@/hooks/useEngine';
import { BLOCK_TYPES } from '@/lib/blocks';
import { ZoomIn, ZoomOut, Maximize, Home } from 'lucide-react';
import type { CameraPreset } from '@/types';

const CAMERA_LABELS: Record<CameraPreset, string> = {
  architect: 'Architect',
  street: 'Street',
  'neural-dive': 'Neural Dive',
  orbit: 'Orbit',
};

// OrbitControls (makeDefault, wheel-zoom enabled) listens for wheel events on
// the canvas DOM element — so the gizmo zoom buttons just synthesize one.
function dolly(direction: 1 | -1) {
  const canvas = document.querySelector('.op-vstage canvas');
  if (!canvas) return;
  canvas.dispatchEvent(
    new WheelEvent('wheel', { deltaY: direction * 240, bubbles: true, cancelable: true }),
  );
}

export function CanvasHud() {
  const activeBlock = useUIStore((s) => s.activeBlock);
  const cameraPreset = useUIStore((s) => s.cameraPreset);
  const setCameraPreset = useUIStore((s) => s.setCameraPreset);
  const hover = useUIStore((s) => s.hoverCell);
  const brush = useUIStore((s) => s.brush);
  const { layers, activeLayer } = useEngineLayers();
  const contract = useEngineContract();

  const block = BLOCK_TYPES[activeBlock];
  const blockColor = block.emissiveIntensity > 0 ? block.emissive : block.color;
  const isEmitter = block.emissiveIntensity > 0;
  const layer = layers.find((l) => l.id === activeLayer);
  const vaultName = contract?.codename ?? 'SPIRE-α';
  const dim = brush.size * 2 + 1;

  return (
    <>
      {/* top HUD: view + vault on the left, zoom + snap on the right */}
      <div className="op-vhud-top">
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="op-chip"><span className="op-cdot" /> {CAMERA_LABELS[cameraPreset]}</span>
          <span className="op-chip"><span className="k">Vault</span><span className="v">{vaultName}</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="op-chip"><span className="k">Snap</span><span className="v">1u</span></span>
          <span className="op-chip"><span className="k">Grid</span><span className="v">64³</span></span>
        </div>
      </div>

      {/* right gizmo cluster */}
      <div className="op-gizmos">
        <div className="op-axis">
          <svg viewBox="0 0 56 56" fill="none">
            <line x1="28" y1="28" x2="48" y2="38" stroke="var(--op-magenta)" strokeWidth="1.4" />
            <line x1="28" y1="28" x2="8"  y2="38" stroke="var(--op-green)" strokeWidth="1.4" />
            <line x1="28" y1="28" x2="28" y2="8"  stroke="var(--accent)" strokeWidth="1.4" />
            <text x="50" y="42" fontSize="8" fill="var(--op-magenta)" fontFamily="var(--font-mono)">X</text>
            <text x="2"  y="42" fontSize="8" fill="var(--op-green)" fontFamily="var(--font-mono)">Z</text>
            <text x="30" y="8"  fontSize="8" fill="var(--accent)" fontFamily="var(--font-mono)">Y</text>
            <circle cx="28" cy="28" r="2" fill="var(--t-1)" />
          </svg>
        </div>
        <div className="op-gizmo">
          <div className="op-gizmo-row">
            <button title="Zoom in" onClick={() => dolly(-1)}><ZoomIn /></button>
            <button title="Fit view" onClick={() => setCameraPreset('architect')}><Maximize /></button>
          </div>
          <div className="op-gizmo-row">
            <button title="Zoom out" onClick={() => dolly(1)}><ZoomOut /></button>
            <button title="Reset camera" onClick={() => setCameraPreset('architect')}><Home /></button>
          </div>
        </div>
      </div>

      {/* selection / context bar */}
      <div className="op-ctxbar">
        <div className="op-grp">
          <span className="op-swatch-sm" style={{ ['--c' as string]: blockColor }} />
          <span className="op-lbl">{block.name}</span>
          <span className="op-sub">{isEmitter ? '· EMITTER' : '· SOLID'}</span>
        </div>
        <div className="op-grp">
          <span className="op-sub">L{(layer?.id ?? 0).toString().padStart(2, '0')}</span>
          <span className="op-lbl magenta">{layer?.name ?? '—'}</span>
        </div>
        <div className="op-grp">
          <span className="op-sub">Cursor</span>
          <span className="op-lbl mono">{hover ? `${hover[0]}, ${hover[1]}, ${hover[2]}` : '— — —'}</span>
        </div>
        <div className="op-grp opt-hide-md">
          <span className="op-sub">Volume</span>
          <span className="op-lbl mono">{dim}×{dim}×{dim}</span>
        </div>
      </div>
    </>
  );
}
