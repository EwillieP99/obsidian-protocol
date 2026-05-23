'use client';

import { useUIStore } from '@/stores/uiStore';
import { BLOCK_ORDER, BLOCK_TYPES, CATEGORY_ORDER } from '@/lib/blocks';
import type { BlockId } from '@/types';
import { Building, Building2, Church, Landmark, Waves } from 'lucide-react';
import { importSaveFromUrlWithLoading } from '@/lib/persistence';
import { toast } from 'sonner';

// Example vaults — fold the old quick-loader into the Block Matrix, matching
// the design's "Example Vaults" list. Counts/icons are decorative.
const VAULTS: Array<{ id: string; name: string; count: string; file: string; Icon: typeof Building }> = [
  { id: 'megaspire',   name: 'Megaspire',           count: '3.2k', file: '/examples/megaspire.json',            Icon: Building2 },
  { id: 'glitchfield', name: 'Glitch Field',        count: '1.8k', file: '/examples/glitchfield.json',          Icon: Waves },
  { id: 'velvet',      name: 'Velvet Shrine',       count: '892',  file: '/examples/velvet-shrine.json',        Icon: Landmark },
  { id: 'arcology',    name: 'Blackspire Arcology', count: '6.4k', file: '/examples/blackspire-arcology.json',  Icon: Building },
  { id: 'cathedral',   name: 'Ghost Cathedral',     count: '4.1k', file: '/examples/ghost-cathedral.json',      Icon: Church },
];

export function BlockPalette() {
  const open = useUIStore((s) => s.panels.palette);
  const activeBlock = useUIStore((s) => s.activeBlock);
  const setActiveBlock = useUIStore((s) => s.setActiveBlock);

  if (!open) return null;

  const loadVault = async (file: string, name: string) => {
    const ok = await importSaveFromUrlWithLoading(file, name);
    if (ok) toast.success(`Loaded vault: ${name}`);
    else toast.error('Failed to load vault');
  };

  return (
    <div className="op-left">
      <div className="op-panel op-tick-corners">
        <div className="op-panel-hd">
          <div className="op-marker" />
          <h2>Block Matrix</h2>
          <span className="op-meta">{BLOCK_ORDER.length} / 256</span>
        </div>

        <div className="op-panel-bd">
          <p style={{ marginBottom: 8, color: 'var(--t-3)', fontSize: 10, lineHeight: 1.45 }}>
            Select block type to paint. Use SAMPLE (I) to pick from the canvas.
          </p>
          {CATEGORY_ORDER.map((cat) => {
            const blocks = BLOCK_ORDER.filter((id) => BLOCK_TYPES[id].category === cat.id);
            if (blocks.length === 0) return null;
            return (
              <div key={cat.id} style={{ display: 'contents' }}>
                <div className="op-label">{cat.label}</div>
                <div className="op-block-grid">
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

          <div className="op-label" style={{ marginTop: 4 }}>Example Vaults</div>
          <div className="op-vaults">
            {VAULTS.map(({ id, name, count, file, Icon }) => (
              <button key={id} className="op-vault" onClick={() => loadVault(file, name)} title={`Load ${name}`}>
                <span className="op-vicon"><Icon size={16} /></span>
                <span className="op-vname">{name}</span>
                <span className="op-vcount">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockSwatch({ id, active, onClick }: { id: BlockId; active: boolean; onClick: () => void }) {
  const b = BLOCK_TYPES[id];
  const glow = b.emissiveIntensity > 0;
  const swatchColor = glow ? b.emissive : b.color;
  const tag = b.shader ? 'SHDR' : glow ? 'EMIT' : null;
  return (
    <button
      type="button"
      className="op-block"
      aria-pressed={active}
      onClick={onClick}
      title={`${b.loreName} — ${b.description}`}
      style={{ ['--c' as string]: swatchColor }}
    >
      <span className="op-swatch" data-kind={glow ? 'glow' : 'solid'} />
      <span className="op-name">{b.name}</span>
      <span className="op-bmeta">
        <span style={{ width: 5, height: 5, background: swatchColor, boxShadow: `0 0 4px ${swatchColor}`, borderRadius: 2 }} />
        {glow ? 'emissive' : 'solid'}
      </span>
      {tag && <span className={`op-tag${b.shader ? ' shdr' : ''}`}>{tag}</span>}
    </button>
  );
}
