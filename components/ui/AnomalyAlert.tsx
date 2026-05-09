'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { AlertTriangle } from 'lucide-react';

export function AnomalyAlert() {
  const alert = useUIStore((s) => s.anomalyAlert);

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -32, opacity: 0 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-40 panel-magenta px-4 py-2 corner-bracket flex items-center gap-2 animate-flicker"
          style={{ borderColor: 'rgba(255, 42, 77, 0.7)' }}
        >
          <AlertTriangle size={14} className="text-signal-red" />
          <span className="terminal text-xs neon-text-magenta" style={{ color: '#ff7b95' }}>
            {alert}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
