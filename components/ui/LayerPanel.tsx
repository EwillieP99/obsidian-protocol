'use client';

import { Reorder } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, GripVertical, ScanEye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEngine, useEngineLayers, useLayerCounts } from '@/hooks/useEngine';
import type { LayerMeta } from '@/types/engine';

// ─── Layer row ─────────────────────────────────────────────────────────────

function LayerRow({
  l, isActive, isSoloed, dimmedBySolo, count,
}: {
  l: LayerMeta;
  isActive: boolean;
  isSoloed: boolean;
  dimmedBySolo: boolean;
  count: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(l.name);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== l.name) getEngine().renameLayer(l.id, trimmed);
    else setDraft(l.name);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'op-layer',
        isActive && 'active',
        !l.visible && 'hidden',
        dimmedBySolo && 'dimmed',
      )}
      onClick={() => !editing && getEngine().setActiveLayer(l.id)}
    >
      <span className="op-grip"><GripVertical size={11} /></span>
      <span className="op-num">{l.id.toString().padStart(2, '0')}</span>

      {editing ? (
        <input
          autoFocus
          className="op-lname-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setDraft(l.name); setEditing(false); }
          }}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="op-lname"
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(l.name); setEditing(true); }}
          title={`${l.name} (double-click to rename)`}
        >
          {l.name}
        </span>
      )}

      <span className="op-lstats">
        <span>{count > 0 ? count.toLocaleString() : '—'}</span>
        {isSoloed && <span className="op-dot" style={{ background: 'var(--op-amber)', boxShadow: '0 0 6px var(--op-amber)' }} />}
        {l.locked && <Lock size={9} style={{ color: 'var(--op-red)' }} />}
      </span>

      <button
        className={cn('op-viz', !l.visible && 'hidden')}
        onClick={(e) => { e.stopPropagation(); getEngine().setLayerVisibility(l.id, !l.visible); }}
        title={l.visible ? 'Visible — click to hide' : 'Hidden — click to show'}
      >
        {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────

export function LayerPanel() {
  const { layers, activeLayer } = useEngineLayers();
  const counts = useLayerCounts();

  const ordered = useMemo<LayerMeta[]>(
    () => [...layers].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)),
    [layers],
  );

  const soloId = ordered.find((l) => l.solo)?.id;
  const anyHidden = ordered.some((l) => !l.visible);
  const visibleCount = ordered.filter((l) => l.visible).length;
  const active = ordered.find((l) => l.id === activeLayer);

  const handleReorder = (newOrder: LayerMeta[]) => {
    for (let i = 0; i < newOrder.length; i++) {
      if (newOrder[i].id !== ordered[i]?.id) {
        const fromIdx = ordered.findIndex((l) => l.id === newOrder[i].id);
        if (fromIdx !== -1) getEngine().moveLayer(fromIdx, i);
        return;
      }
    }
  };

  const isolateActive = () => {
    const engine = getEngine();
    if (soloId !== undefined || anyHidden) {
      // Restore everything.
      for (const l of ordered) {
        engine.setLayerVisibility(l.id, true);
        engine.setLayerSolo(l.id, false);
      }
    } else {
      for (const l of ordered) {
        engine.setLayerVisibility(l.id, l.id === activeLayer);
        engine.setLayerSolo(l.id, l.id === activeLayer);
      }
    }
  };

  return (
    <div className="op-panel op-layers-panel">
      <div className="op-panel-hd">
        <div className="op-marker magenta" />
        <h2>Vault Layers</h2>
        <span className="op-meta">{visibleCount} active</span>
      </div>

      <div className="op-panel-bd">
        <Reorder.Group axis="y" values={ordered} onReorder={handleReorder} className="op-layer-list">
          {ordered.map((l) => (
            <Reorder.Item
              key={l.id}
              value={l}
              whileDrag={{ scale: 1.02, boxShadow: '0 0 14px rgba(255,46,136,0.4)' }}
            >
              <LayerRow
                l={l}
                isActive={activeLayer === l.id}
                isSoloed={soloId === l.id}
                dimmedBySolo={soloId !== undefined && soloId !== l.id}
                count={counts.get(l.id) ?? 0}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <div className="op-layer-foot">
          <button className="op-add" onClick={isolateActive}>
            <ScanEye size={12} />
            {soloId !== undefined || anyHidden ? 'Show all' : 'Isolate active'}
          </button>
          <button
            className={cn('op-iconbtn', active?.locked && 'on')}
            title={active?.locked ? 'Unlock active layer' : 'Lock active layer'}
            onClick={() => active && getEngine().setLayerLock(active.id, !active.locked)}
          >
            {active?.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button
            className="op-iconbtn"
            title={active?.visible ? 'Hide active layer' : 'Show active layer'}
            onClick={() => active && getEngine().setLayerVisibility(active.id, !active.visible)}
          >
            {active?.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
