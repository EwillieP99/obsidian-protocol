'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { BLOCK_ORDER, BLOCK_TYPES, CATEGORY_ORDER } from '@/lib/blocks';
import { cn } from '@/lib/utils';
import type { BlockId } from '@/types';

export function BlockPalette() {
  const open = useUIStore((s) => s.panels.palette);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const activeBlock = useUIStore((s) => s.activeBlock);
  const setActiveBlock = useUIStore((s) => s.setActiveBlock);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: -260, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -260, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute top-20 left-4 z-30 panel w-60 corner-bracket"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-cyan-neon/20">
            <span className="terminal text-xs neon-text-cyan">// BLOCK MATRIX</span>
            <button
              className="terminal text-[10px] text-cyan-glow/60 hover:text-cyan-neon"
              onClick={() => togglePanel('palette')}
              title="Hide palette (P)"
            >
              [ HIDE ]
            </button>
          </header>
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {CATEGORY_ORDER.map((cat) => {
              const blocks = BLOCK_ORDER.filter((id) => BLOCK_TYPES[id].category === cat.id);
              if (blocks.length === 0) return null;
              return (
                <div key={cat.id} className="mb-2">
                  <div className="terminal text-[10px] text-cyan-glow/50 px-1 mb-1">/// {cat.label}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {blocks.map((id) => (
                      <BlockSwatch
                        key={id}
                        id={id}
                        active={activeBlock === id}
                        onClick={() => setActiveBlock(id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-cyan-neon/20 terminal text-[10px] text-cyan-glow/60">
            Right-click drag = quick erase
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BlockSwatch({ id, active, onClick }: { id: BlockId; active: boolean; onClick: () => void }) {
  const b = BLOCK_TYPES[id];
  const glow = b.emissiveIntensity > 0;
  return (
    <motion.button
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-stretch gap-1 px-2 py-1.5 border transition-colors',
        active
          ? 'border-cyan-neon bg-cyan-neon/15'
          : 'border-cyan-neon/15 hover:border-cyan-neon/60 hover:bg-cyan-neon/5',
      )}
      title={`${b.loreName} — ${b.description}`}
      style={
        active
          ? { boxShadow: `0 0 14px ${b.emissive}80, inset 0 0 8px ${b.emissive}50` }
          : undefined
      }
    >
      <div
        className="w-full h-7 border border-white/10"
        style={{
          background: b.color,
          boxShadow: glow ? `0 0 12px ${b.emissive}, inset 0 0 6px ${b.emissive}` : 'none',
        }}
      />
      <div className="terminal text-[10px] text-cyan-glow/85 truncate">{b.name}</div>
      {b.shader && (
        <span className="absolute top-1 right-1 terminal text-[8px] neon-text-magenta">SHDR</span>
      )}
      {active && (
        <motion.span
          layoutId="palette-active-pulse"
          className="absolute -inset-px pointer-events-none"
          style={{
            border: `1px solid ${b.emissive}`,
            boxShadow: `0 0 18px ${b.emissive}, inset 0 0 8px ${b.emissive}80`,
          }}
        />
      )}
    </motion.button>
  );
}
