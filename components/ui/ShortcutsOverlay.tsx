'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { X } from 'lucide-react';

interface Shortcut {
  combo: string;
  action: string;
}

const GROUPS: Array<{ title: string; rows: Shortcut[] }> = [
  {
    title: 'BRUSHES',
    rows: [
      { combo: 'B', action: 'Paint mode' },
      { combo: 'E', action: 'Purge (erase) mode' },
      { combo: 'F', action: 'Fill mode (empty cells only)' },
      { combo: 'R', action: 'Rewrite — replace matching block type' },
      { combo: 'I', action: 'Sample (eyedropper)' },
      { combo: 'X', action: 'Select region (click two corners)' },
      { combo: '[ / ]', action: 'Decrease / increase brush size' },
      { combo: 'Shift + drag', action: 'Freehand: lock stroke to dominant axis' },
      { combo: 'Shift / Ctrl (line)', action: 'Tap mid-drag to lock a corner & turn — trace rectangles' },
    ],
  },
  {
    title: 'CAMERA',
    rows: [
      { combo: '1 / 2 / 3', action: 'Architect / Street / Neural Dive' },
      { combo: 'C', action: 'Toggle cinematic auto-rotate' },
      { combo: 'Double-click block', action: 'Focus camera on selection' },
    ],
  },
  {
    title: 'PANELS',
    rows: [
      { combo: 'A', action: 'Toggle Artifact Library' },
      { combo: 'L', action: 'Toggle layers panel' },
      { combo: 'P', action: 'Toggle block matrix' },
      { combo: 'H', action: 'Toggle chrono log (history)' },
      { combo: '?  /  /', action: 'Toggle this shortcuts overlay' },
    ],
  },
  {
    title: 'ARTIFACTS',
    rows: [
      { combo: 'Esc', action: 'Cancel stamp mode / clear selection' },
      { combo: 'R (stamp mode)', action: 'Rotate stamp 90°' },
      { combo: 'M (stamp mode)', action: 'Mirror stamp on X axis' },
    ],
  },
  {
    title: 'WORLD',
    rows: [
      { combo: 'N', action: 'Generate new corporate contract' },
      { combo: 'Ctrl/⌘ + C', action: 'Copy selected region to clipboard' },
      { combo: 'Ctrl/⌘ + V', action: 'Paste clipboard at cursor' },
      { combo: 'Ctrl/⌘ + Z', action: 'Undo' },
      { combo: 'Ctrl/⌘ + Shift+Z', action: 'Redo (also Ctrl/⌘+Y)' },
      { combo: 'Ctrl/⌘ + S', action: 'Save vault to local cache' },
      { combo: 'M', action: 'Mute audio' },
    ],
  },
  {
    title: 'POINTER',
    rows: [
      { combo: 'Left-click drag', action: 'Paint with current brush (Freehand or Line stroke)' },
      { combo: 'Right-click drag', action: 'Orbit camera (look around)' },
      { combo: 'Mouse wheel', action: 'Zoom (orbit camera)' },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useUIStore((s) => s.panels.shortcuts);
  const setPanel = useUIStore((s) => s.setPanel);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-void/85 backdrop-blur-sm"
            onClick={() => setPanel('shortcuts', false)}
          />
          <motion.div
            initial={{ scale: 0.94, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="relative panel corner-bracket w-[820px] max-w-[94vw] max-h-[88vh] overflow-hidden"
          >
            <header className="flex items-center justify-between px-5 py-3 border-b border-cyan-neon/25">
              <div>
                <div className="terminal text-[10px] text-cyan-glow/60">// NEXUS-OS // INPUT MAPPING</div>
                <div className="terminal text-lg neon-text-cyan tracking-widest">KEYBOARD SHORTCUTS</div>
              </div>
              <button
                className="btn-neon !px-2 !py-1"
                onClick={() => setPanel('shortcuts', false)}
                title="Close (?)"
              >
                <X size={14} />
              </button>
            </header>

            <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4 overflow-y-auto max-h-[68vh]">
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="terminal text-[10px] neon-text-magenta mb-2">/// {g.title}</div>
                  <div className="space-y-1">
                    {g.rows.map((r) => (
                      <div key={r.combo} className="flex items-baseline gap-3">
                        <Kbd>{r.combo}</Kbd>
                        <span className="terminal text-[11px] text-cyan-glow/85">{r.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <footer className="px-5 py-2 border-t border-cyan-neon/25 flex items-center justify-between">
              <span className="terminal text-[10px] text-cyan-glow/55">
                Press <Kbd inline>?</Kbd> or <Kbd inline>/</Kbd> anywhere to dismiss.
              </span>
              <span className="terminal text-[10px] text-magenta-glow/55">// END OF MAPPING</span>
            </footer>

            {/* Animated data stream accent */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] data-stream-accent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] data-stream-accent" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <span
      className={
        'terminal text-[10px] neon-text-cyan border border-cyan-neon/40 bg-cyan-neon/10 ' +
        'px-1.5 py-0.5 inline-block min-w-[28px] text-center ' +
        (inline ? '' : 'whitespace-nowrap')
      }
      style={{ boxShadow: 'inset 0 -1px 0 rgba(0,249,255,0.25)' }}
    >
      {children}
    </span>
  );
}
