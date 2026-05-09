'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';

/**
 * Briefly shown when a save is being applied or a layer is being rebuilt.
 * `loading` is a free-form message; setting it to null hides the veil.
 */
export function LoadingVeil() {
  const message = useUIStore((s) => s.loading);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="loading-veil"
        >
          <div className="panel corner-bracket px-6 py-4 text-center">
            <div className="terminal text-[10px] text-cyan-glow/65 mb-2">// NEXUS-OS</div>
            <div className="terminal text-sm neon-text-cyan tracking-widest">{message}</div>
            <div className="mt-3 h-[2px] w-44 mx-auto data-stream-accent" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
