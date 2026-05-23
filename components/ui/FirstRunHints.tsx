'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';

const HINTS_KEY = 'op:first-run-hints:v1';

const HINTS = [
  'Studio mode is the default — toggle Immersive in Settings for integrity meter and contracts.',
  'Press A to open the Artifact Library and stamp prefabs into your vault.',
  'Drag-select with Select mode (X), then Ctrl+C / Ctrl+V to copy regions.',
  'Named saves and autosave use OBS2 binary — export/import from the toolbar IO group.',
];

export function FirstRunHints() {
  const booted = useUIStore((s) => s.booted);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!booted) return;
    try {
      if (localStorage.getItem(HINTS_KEY)) return;
      setVisible(true);
    } catch {
      // private mode — show hints once per session
      setVisible(true);
    }
  }, [booted]);

  const dismiss = () => {
    try {
      localStorage.setItem(HINTS_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] w-[min(520px,92vw)]"
        >
          <div className="panel corner-bracket p-4">
            <div className="terminal text-[10px] text-cyan-glow/70 mb-2">// STUDIO QUICK START</div>
            <ul className="text-xs text-t-2 space-y-2 mb-3 list-disc pl-4">
              {HINTS.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <button type="button" className="op-btn text-xs" onClick={dismiss}>
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
