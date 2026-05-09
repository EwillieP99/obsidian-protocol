'use client';

import { useUIStore } from '@/stores/uiStore';
import { useVoxelStore } from '@/stores/voxelStore';
import { useEffect, useState } from 'react';

export function StatusBar() {
  const fps = useUIStore((s) => s.fps);
  const memMB = useUIStore((s) => s.memoryMB);
  const showFps = useUIStore((s) => s.scene.showFps);
  const setScene = useUIStore((s) => s.setScene);
  const quality = useUIStore((s) => s.scene.quality);
  const hover = useUIStore((s) => s.hoverCell);
  const renderer = useUIStore((s) => s.rendererMode);
  const blockCount = useVoxelStore((s) => s.cells.size);
  const integrity = useVoxelStore((s) => s.computeIntegrity());

  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fpsColor = fps > 55 ? 'text-signal-green' : fps > 30 ? 'text-signal-amber' : 'text-signal-red';
  const integrityColor =
    integrity > 0.75 ? 'text-signal-green' :
    integrity > 0.4 ? 'text-signal-amber' : 'text-signal-red';
  const showMemory = blockCount > 3000 && memMB > 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 panel border-t-cyan-neon/30 px-3 py-1 flex items-center gap-4 terminal text-[10px] text-cyan-glow/80 status-stream">
      <span className="flex items-center gap-1.5">
        <span className="pulse-dot" />
        <span className="neon-text-cyan">NEXUS::ONLINE</span>
      </span>
      <Sep />
      <span>RENDERER · <span className="neon-text-cyan">{renderer.toUpperCase()}</span></span>
      <Sep />
      <span>QUALITY · <span className="neon-text-cyan">{quality.toUpperCase()}</span></span>
      <Sep />
      {showFps && (
        <>
          <button
            onClick={() => setScene({ showFps: false })}
            title="Click to hide FPS readout"
            className="hover:text-cyan-neon"
          >
            FPS · <span className={fpsColor}>{fps.toString().padStart(3, '0')}</span>
          </button>
          <Sep />
        </>
      )}
      {!showFps && (
        <>
          <button
            onClick={() => setScene({ showFps: true })}
            title="Show FPS readout"
            className="text-cyan-glow/40 hover:text-cyan-neon"
          >
            FPS · ---
          </button>
          <Sep />
        </>
      )}
      {showMemory && (
        <>
          <span title="Approximate JS heap usage (Chromium only)">
            MEM · <span className="neon-text-cyan">{memMB.toFixed(0)}MB</span>
          </span>
          <Sep />
        </>
      )}
      <span>BLOCKS · <span className="neon-text-cyan">{blockCount.toString().padStart(4, '0')}</span></span>
      <Sep />
      <span>
        CURSOR · <span className="neon-text-cyan">
          {hover ? `[${hover[0].toString().padStart(3)},${hover[1].toString().padStart(2)},${hover[2].toString().padStart(3)}]` : '[ — — — ]'}
        </span>
      </span>
      <Sep />
      <span>INTEGRITY · <span className={integrityColor}>{(integrity * 100).toFixed(0)}%</span></span>
      <div className="ml-auto flex items-center gap-4">
        <span>UTC · <span className="neon-text-cyan">{t.toISOString().slice(11, 19)}</span></span>
        <span className="text-magenta-glow/70">© NEON NEXUS MEGACORP // 2077</span>
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-cyan-neon/30">|</span>;
}
