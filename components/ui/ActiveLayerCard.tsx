'use client';

import { getEngine, useEngineLayers, useLayerCounts, useLayerDominantBlocks } from '@/hooks/useEngine';
import { BLOCK_TYPES } from '@/lib/blocks';
import type { BlockId } from '@/types';

export function ActiveLayerCard() {
  const { layers, activeLayer } = useEngineLayers();
  const counts = useLayerCounts();
  const dominant = useLayerDominantBlocks();

  const l = layers.find((x) => x.id === activeLayer);
  if (!l) return null;

  const count = counts.get(l.id) ?? 0;
  const blocks = (dominant.get(l.id) ?? []).slice(0, 4);
  const opacityPct = Math.round((l.opacity ?? 1) * 100);

  return (
    <div className="op-panel">
      <div className="op-panel-hd">
        <div className="op-marker magenta" />
        <h2>Active Layer</h2>
        <span className="op-meta">{l.id.toString().padStart(2, '0')}</span>
      </div>

      <div className="op-panel-bd op-active-card">
        <div className="op-ahead">
          <span className="op-pill">{l.id.toString().padStart(2, '0')}</span>
          <span className="op-lname">{l.name}</span>
        </div>

        <dl className="op-kv">
          <dt>Blocks</dt><dd>{count.toLocaleString()}</dd>
          <dt>Cells filled</dt><dd>{count.toLocaleString()}</dd>
          <dt>Dominant blocks</dt>
          <dd>
            {blocks.length > 0 ? (
              <span className="op-colorspots">
                {blocks.map((id) => {
                  const b = BLOCK_TYPES[id as BlockId];
                  const color = b ? (b.emissiveIntensity > 0 ? b.emissive : b.color) : '#888';
                  return <i key={id} style={{ ['--c' as string]: color }} />;
                })}
              </span>
            ) : (
              <span style={{ color: 'var(--t-3)' }}>—</span>
            )}
          </dd>
        </dl>

        <div className="op-opacity-row" style={{ ['--p' as string]: `${opacityPct}%` }}>
          <label>Opacity</label>
          <input
            type="range"
            min={0}
            max={100}
            value={opacityPct}
            onChange={(e) => getEngine().setLayerOpacity(l.id, Number(e.target.value) / 100)}
          />
          <span className="op-val">{opacityPct}%</span>
        </div>
      </div>
    </div>
  );
}
