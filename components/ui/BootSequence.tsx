'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';

const BOOT_LINES = [
  '> NEXUS-OS v8.41.2 // OBSIDIAN PROTOCOL',
  '> Establishing neural link……………… [ OK ]',
  '> Probing renderer capability ……… [ WebGL2 / GLSL 3.00 ]',
  '> Loading vault substrate (12 layers) [ OK ]',
  '> Authenticating Architect credentials',
  '   user :: NEXUS-ARCHITECT-7791',
  '   clearance :: OMEGA-BLACK',
  '> Spinning up post-processing matrix',
  '> Calibrating bloom envelope ............... 1.10',
  '> Engaging chromatic aberration .......... 0.0015',
  '> Streaming ambient drone telemetry ……… [ OK ]',
  '> Loading Corporate Contract feed …… 1 PENDING',
  '',
  '> ALL SYSTEMS NOMINAL.',
  '> Welcome back, Architect.',
];

export function BootSequence() {
  const setBooted = useUIStore((s) => s.setBooted);
  const [visible, setVisible] = useState<number>(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible((v) => {
        if (v >= BOOT_LINES.length) {
          clearInterval(id);
          setTimeout(() => setDone(true), 320);
          setTimeout(() => setBooted(true), 900);
          return v;
        }
        return v + 1;
      });
    }, 110);
    return () => clearInterval(id);
  }, [setBooted]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[100] bg-void flex items-center justify-center"
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="data-strip absolute inset-0" />
          </div>
          <div className="relative w-[640px] max-w-[92vw] panel p-6 corner-bracket">
            <div className="flex items-center justify-between mb-4 terminal text-xs text-cyan-glow/70">
              <span>NEXUS-OS // SECURE NEURAL TERMINAL</span>
              <span className="flex items-center gap-2">
                <span className="pulse-dot" />
                <span>LINK ESTABLISHING</span>
              </span>
            </div>
            <div className="terminal text-[13px] leading-relaxed">
              <div className="glitch text-2xl mb-4 neon-text-cyan" data-text="OBSIDIAN PROTOCOL">
                OBSIDIAN PROTOCOL
              </div>
              {BOOT_LINES.slice(0, visible).map((l, i) => (
                <div
                  key={i}
                  className={
                    l.startsWith('> ALL SYSTEMS') ? 'text-signal-green mt-2' :
                    l.startsWith('> Welcome') ? 'text-cyan-neon' :
                    l.startsWith('   ') ? 'text-magenta-glow/80 pl-2' :
                    'text-cyan-glow/85'
                  }
                >
                  {l || ' '}
                </div>
              ))}
              <div className="text-cyan-neon animate-pulse mt-1">
                {visible < BOOT_LINES.length ? '_' : ''}
              </div>
            </div>
          </div>
          {/* Subtle vignette */}
          <div className="pointer-events-none absolute inset-0"
               style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
