'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useVoxelStore } from '@/stores/voxelStore';
import { generateContract, applyContract } from '@/lib/contracts';
import { toast } from 'sonner';

const HAZARD_COLOR: Record<'low' | 'medium' | 'high' | 'critical', string> = {
  low: '#39ff14',
  medium: '#ffb000',
  high: '#ff66cc',
  critical: '#ff2a4d',
};

export function ContractPanel() {
  const open = useUIStore((s) => s.panels.contract);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const contract = useVoxelStore((s) => s.contract);
  const setContract = useVoxelStore((s) => s.setContract);

  const handleNew = () => {
    const c = generateContract();
    setContract(c);
    applyContract(c);
    toast.success('CONTRACT ASSIGNED', { description: `${c.codename} — ${c.client}` });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: -200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -200, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="absolute top-20 right-[280px] z-30 panel-magenta w-80 corner-bracket"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-magenta-neon/25">
            <span className="terminal text-xs neon-text-magenta">// CORPORATE CONTRACT</span>
            <button
              className="terminal text-[10px] text-magenta-glow/70 hover:text-magenta-neon"
              onClick={() => togglePanel('contract')}
            >
              [ HIDE ]
            </button>
          </header>

          {!contract ? (
            <div className="p-4 terminal text-[11px] text-magenta-glow/80">
              No active contract.
              <button onClick={handleNew} className="btn-magenta w-full mt-3">
                REQUEST NEW ASSIGNMENT
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <Field label="CODENAME" value={contract.codename} mono />
              <Field label="CLIENT" value={contract.client} />
              <Field
                label="HAZARD"
                value={contract.hazard.toUpperCase()}
                colorOverride={HAZARD_COLOR[contract.hazard]}
              />
              <Field label="PAYOUT" value={`¥ ${contract.payout.toLocaleString()}`} />
              <div>
                <div className="terminal text-[9px] text-magenta-glow/55">BRIEF</div>
                <div className="terminal text-[11px] text-magenta-glow/95 leading-relaxed mt-1 italic">
                  &ldquo;{contract.brief}&rdquo;
                </div>
              </div>
              <button onClick={handleNew} className="btn-magenta w-full mt-2">
                ROTATE CONTRACT
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  mono,
  colorOverride,
}: { label: string; value: string; mono?: boolean; colorOverride?: string }) {
  return (
    <div>
      <div className="terminal text-[9px] text-magenta-glow/55">{label}</div>
      <div
        className={`terminal ${mono ? 'text-sm' : 'text-[12px]'} text-magenta-glow`}
        style={colorOverride ? { color: colorOverride } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
