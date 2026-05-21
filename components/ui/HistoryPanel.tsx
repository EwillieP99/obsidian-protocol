'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { getEngine, useEngineChrono } from '@/hooks/useEngine';
import { fmtTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function HistoryPanel() {
  const open = useUIStore((s) => s.panels.history);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const { entries: history, futureEntries: future } = useEngineChrono();
  const recentId = history[history.length - 1]?.id;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 panel w-[640px] max-w-[90vw] corner-bracket"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-cyan-neon/20">
            <span className="terminal text-xs neon-text-cyan">// CHRONO LOG</span>
            <div className="flex items-center gap-2">
              <span className="terminal text-[10px] text-cyan-glow/65">
                {history.length} REVISIONS · {future.length} FORWARD
              </span>
              <button className="terminal text-[10px] text-cyan-glow/65 hover:text-cyan-neon" onClick={() => getEngine().undo()} title="Undo">[ ↩ ]</button>
              <button className="terminal text-[10px] text-cyan-glow/65 hover:text-cyan-neon" onClick={() => getEngine().redo()} title="Redo">[ ↪ ]</button>
            </div>
            <button
              className="terminal text-[10px] text-cyan-glow/65 hover:text-cyan-neon"
              onClick={() => togglePanel('history')}
            >
              [ HIDE ]
            </button>
          </header>
          <div className="px-3 py-2 max-h-44 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {history.length === 0 && future.length === 0 && (
                <div className="terminal text-[11px] text-cyan-glow/50">
                  Awaiting first neural impulse…
                </div>
              )}
              {history.map((h) => {
                const isCurrent = h.id === recentId;
                return (
                  <motion.button
                    key={h.id}
                    layout
                    animate={isCurrent ? { boxShadow: ['0 0 0px rgba(0,249,255,0)', '0 0 14px rgba(0,249,255,0.55)', '0 0 0px rgba(0,249,255,0)'] } : { boxShadow: '0 0 0px rgba(0,249,255,0)' }}
                    transition={{ duration: 0.6 }}
                    whileHover={{ scale: 1.04 }}
                    onClick={() => getEngine().jumpToChrono(h.id)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 px-2 py-1 border min-w-[64px]',
                      isCurrent
                        ? 'border-cyan-neon bg-cyan-neon/10'
                        : 'border-cyan-neon/25 hover:border-cyan-neon/70 hover:bg-cyan-neon/5 transition-colors',
                    )}
                    title={`${h.label} · ${fmtTime(h.timestamp)} · ${h.opCount} cells`}
                  >
                    <div className="terminal text-[10px] neon-text-cyan truncate w-full">{h.label}</div>
                    <div className="terminal text-[9px] text-cyan-glow/50">{fmtTime(h.timestamp)}</div>
                    <div className="terminal text-[8px] text-cyan-glow/65">Δ{h.opCount}</div>
                  </motion.button>
                );
              })}
              {future.length > 0 && <div className="w-px h-12 bg-magenta-neon/40 mx-2" />}
              {[...future].reverse().map((h, i) => (
                <button
                  key={h.id}
                  onClick={() => {
                    for (let s = 0; s <= i; s++) getEngine().redo();
                  }}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-1 border min-w-[64px]',
                    'border-magenta-neon/35 hover:border-magenta-neon hover:bg-magenta-neon/5 transition-colors opacity-65',
                  )}
                  title={`(future) ${h.label}`}
                >
                  <div className="terminal text-[10px] neon-text-magenta truncate w-full">{h.label}</div>
                  <div className="terminal text-[9px] text-magenta-glow/50">{fmtTime(h.timestamp)}</div>
                  <div className="terminal text-[8px] text-magenta-glow/65">Δ{h.opCount}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
