'use client';

import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { Eye, EyeOff, Lock, Unlock, Headphones, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEngine, useEngineLayers, useLayerCounts } from '@/hooks/useEngine';
import type { LayerMeta } from '@/types/engine';

export function LayerPanel() {
  const open = useUIStore((s) => s.panels.layers);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const { layers, activeLayer } = useEngineLayers();
  const ordered = useMemo<LayerMeta[]>(
    () => [...layers].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)),
    [layers],
  );
  const counts = useLayerCounts();

  const handleReorder = (newOrder: LayerMeta[]) => {
    for (let i = 0; i < newOrder.length; i++) {
      if (newOrder[i].id !== ordered[i]?.id) {
        const fromIdx = ordered.findIndex((l) => l.id === newOrder[i].id);
        if (fromIdx !== -1) getEngine().moveLayer(fromIdx, i);
        return;
      }
    }
  };

  const soloId = ordered.find((l) => l.solo)?.id;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 260, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 260, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute top-20 right-4 z-30 panel-magenta w-72 corner-bracket"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-magenta-neon/25">
            <span className="terminal text-xs neon-text-magenta">// VAULT LAYERS</span>
            <button
              className="terminal text-[10px] text-magenta-glow/70 hover:text-magenta-neon"
              onClick={() => togglePanel('layers')}
              title="Hide layers (L)"
            >
              [ HIDE ]
            </button>
          </header>
          <Reorder.Group
            axis="y"
            values={ordered}
            onReorder={handleReorder}
            className="p-1 max-h-[60vh] overflow-y-auto"
          >
            {ordered.map((l) => {
              const isActive = activeLayer === l.id;
              const isSoloed = soloId === l.id;
              const dimmedBySolo = soloId !== undefined && !isSoloed;
              return (
                <Reorder.Item
                  key={l.id}
                  value={l}
                  whileDrag={{ scale: 1.02, boxShadow: '0 0 14px rgba(255,0,170,0.5)' }}
                  className={cn(
                    'border-b border-magenta-neon/10 cursor-grab active:cursor-grabbing',
                    dimmedBySolo && 'opacity-50',
                  )}
                >
                  <div
                    onClick={() => getEngine().setActiveLayer(l.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5',
                      isActive ? 'bg-magenta-neon/12' : 'hover:bg-magenta-neon/5',
                      isSoloed && 'ring-1 ring-signal-amber/70',
                    )}
                  >
                    <GripVertical size={11} className="text-magenta-glow/40" />
                    <span className="terminal text-[10px] text-magenta-glow/50 w-6 text-right">
                      {l.id.toString().padStart(2, '0')}
                    </span>
                    <span className={cn('terminal text-xs flex-1 truncate', isActive ? 'neon-text-magenta' : 'text-magenta-glow/85')}>
                      {l.name}
                    </span>
                    <span className="terminal text-[10px] text-magenta-glow/50 w-9 text-right">
                      {counts.get(l.id) ?? 0}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); getEngine().setLayerSolo(l.id, !l.solo); }}
                      className={cn(
                        'p-1 hover:text-signal-amber',
                        l.solo ? 'text-signal-amber' : 'text-magenta-glow/40',
                      )}
                      title="Solo this layer"
                    >
                      <Headphones size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); getEngine().setLayerLock(l.id, !l.locked); }}
                      className={cn('p-1 hover:text-magenta-neon', l.locked ? 'text-signal-red' : 'text-magenta-glow/50')}
                      title="Lock layer"
                    >
                      {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); getEngine().setLayerVisibility(l.id, !l.visible); }}
                      className={cn('p-1 hover:text-magenta-neon', l.visible ? 'text-magenta-glow' : 'text-magenta-glow/30')}
                      title="Toggle visibility"
                    >
                      {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                  </div>
                  {isActive && (
                    <div
                      className="px-3 pb-2 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="terminal text-[9px] text-magenta-glow/60">OPACITY</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={l.opacity ?? 1}
                        onChange={(e) => getEngine().setLayerOpacity(l.id, parseFloat(e.target.value))}
                        className="flex-1 h-1 accent-magenta-neon"
                      />
                      <span className="terminal text-[9px] neon-text-magenta w-6 text-right">
                        {Math.round((l.opacity ?? 1) * 100)}
                      </span>
                    </div>
                  )}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          <div className="px-3 py-2 border-t border-magenta-neon/25 terminal text-[10px] text-magenta-glow/65">
            Active: {ordered.find((l) => l.id === activeLayer)?.name}
            {soloId !== undefined && (
              <span className="ml-2 text-signal-amber">· SOLO</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
