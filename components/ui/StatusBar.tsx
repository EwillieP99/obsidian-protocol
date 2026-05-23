'use client';

import { useUIStore } from '@/stores/uiStore';
import { useEffect, useState } from 'react';
import { useEngineStats, useEngineLayers } from '@/hooks/useEngine';

export function StatusBar() {
  const fps = useUIStore((s) => s.fps);
  const memMB = useUIStore((s) => s.memoryMB);
  const showFps = useUIStore((s) => s.scene.showFps);
  const setScene = useUIStore((s) => s.setScene);
  const quality = useUIStore((s) => s.scene.quality);
  const hover = useUIStore((s) => s.hoverCell);
  const renderer = useUIStore((s) => s.rendererMode);
  const brush = useUIStore((s) => s.brush);
  const immersiveMode = useUIStore((s) => s.immersiveMode);
  const lastSavedAt = useUIStore((s) => s.lastSavedAt);
  const lastSaveError = useUIStore((s) => s.lastSaveError);
  const engineDegraded = useUIStore((s) => s.engineDegraded);
  const stampArtifact = useUIStore((s) => s.stampArtifact);
  const { cellCount, integrity } = useEngineStats();
  const { layers, activeLayer } = useEngineLayers();

  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const layerName = layers.find((l) => l.id === activeLayer)?.name ?? `L${activeLayer}`;
  const fpsColor = fps > 55 ? 'var(--op-green)' : fps > 30 ? 'var(--op-amber)' : 'var(--op-red)';
  const integrityColor =
    integrity > 0.75 ? 'var(--op-green)' :
    integrity > 0.4 ? 'var(--op-amber)' : 'var(--op-red)';
  const showMemory = cellCount > 3000 && memMB > 0;

  const saveLabel = lastSavedAt
    ? `Saved ${Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000))}s ago`
    : 'Autosave 20s';

  return (
    <div className="op-footer">
      <div className="op-statusbar">
        <span className="op-live">{engineDegraded ? 'Engine Degraded' : 'Nexus Online'}</span>

        <span className="opt-hide-sm"><span className="k">Renderer</span><span className="v">{renderer.toUpperCase()}</span></span>
        <span className="opt-hide-md"><span className="k">Quality</span><span className="v">{quality.toUpperCase()}</span></span>

        {showFps ? (
          <button className="k-btn" onClick={() => setScene({ showFps: false })} title="Click to hide FPS readout">
            <span className="k">FPS</span><span className="v" style={{ color: fpsColor }}>{fps.toString().padStart(3, '0')}</span>
          </button>
        ) : (
          <button className="k-btn" onClick={() => setScene({ showFps: true })} title="Show FPS readout">
            <span className="k">FPS</span><span className="v" style={{ color: 'var(--t-3)' }}>---</span>
          </button>
        )}

        {showMemory && (
          <span className="opt-hide-md" title="Approximate JS heap usage (Chromium only)">
            <span className="k">Mem</span><span className="v">{memMB.toFixed(0)}MB</span>
          </span>
        )}

        <span><span className="k">Blocks</span><span className="v">{cellCount.toLocaleString()}</span></span>

        <span className="opt-hide-md">
          <span className="k">Layer</span>
          <span className="v">{layerName}</span>
        </span>

        <span className="opt-hide-md">
          <span className="k">Cursor</span>
          <span className="v">{hover ? `${hover[0]}, ${hover[1]}, ${hover[2]}` : '— — —'}</span>
        </span>

        {immersiveMode && (
          <span><span className="k">Integrity</span><span className="v" style={{ color: integrityColor }}>{(integrity * 100).toFixed(0)}%</span></span>
        )}

        <span className="op-st-spacer" />

        <span title={lastSaveError ?? 'IndexedDB autosave interval'}>
          <span className="k">Save</span>
          <span className="v" style={lastSaveError ? { color: 'var(--op-red)' } : undefined}>
            {lastSaveError ? 'Failed' : saveLabel}
          </span>
        </span>

        <span>
          <span className="k">Tool</span>
          <span className="v">
            {stampArtifact ? `STAMP · ${stampArtifact.name}` : `${brush.mode.toUpperCase()} · ${brush.size}`}
          </span>
        </span>
        <span className="opt-hide-sm"><span className="k">UTC</span><span className="v">{t.toISOString().slice(11, 19)}</span></span>
        <span className="opt-hide-md" style={{ color: 'var(--accent)' }}>© Neon Nexus // 2077</span>
      </div>
    </div>
  );
}
