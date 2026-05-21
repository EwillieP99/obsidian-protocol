'use client';

import { useUIStore } from '@/stores/uiStore';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEngineStats } from '@/hooks/useEngine';

export function IntegrityMeter() {
  const { integrity } = useEngineStats();
  const setScene = useUIStore((s) => s.setScene);
  const setAlert = useUIStore((s) => s.setAnomalyAlert);
  const alert = useUIStore((s) => s.anomalyAlert);

  useEffect(() => {
    if (integrity < 0.4) {
      setScene({ glitchEffect: true });
      if (!alert) setAlert('VAULT DESTABILIZING — purge anomalies or stabilize core nodes.');
    } else {
      setScene({ glitchEffect: false });
      if (alert && integrity > 0.55) setAlert(null);
    }
  }, [integrity, setScene, setAlert, alert]);

  const pct = Math.round(integrity * 100);
  const status =
    integrity > 0.85 ? 'NOMINAL' :
    integrity > 0.65 ? 'STABLE' :
    integrity > 0.4 ? 'STRESSED' :
    integrity > 0.2 ? 'CRITICAL' :
    'CASCADING';

  const color =
    integrity > 0.65 ? '#39ff14' :
    integrity > 0.4 ? '#ffb000' :
    '#ff2a4d';

  return (
    <div className="absolute top-4 right-4 z-30 panel-magenta px-3 py-2 corner-bracket w-56">
      <div className="flex items-center justify-between mb-1">
        <span className="terminal text-[10px] neon-text-magenta">// NEURAL INTEGRITY</span>
        <span className="terminal text-[10px]" style={{ color }}>{status}</span>
      </div>
      <div className="h-2 bg-void/80 border border-magenta-neon/30 overflow-hidden relative">
        <motion.div
          className="h-full"
          style={{ background: `linear-gradient(90deg, ${color}, ${color}66)` }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-void/60 last:border-r-0" />
          ))}
        </div>
      </div>
      <div className="terminal text-[10px] text-magenta-glow/80 mt-1">
        {pct}% · anomalies pressuring substrate
      </div>
    </div>
  );
}
