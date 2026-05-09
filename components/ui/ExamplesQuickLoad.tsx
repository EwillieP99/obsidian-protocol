'use client';

import { motion } from 'framer-motion';
import { importSaveFromUrlWithLoading } from '@/lib/persistence';
import { toast } from 'sonner';

const EXAMPLES = [
  { id: 'megaspire', label: 'MEGASPIRE', file: '/examples/megaspire.json' },
  { id: 'glitchfield', label: 'GLITCH FIELD', file: '/examples/glitchfield.json' },
  { id: 'velvet-shrine', label: 'VELVET SHRINE', file: '/examples/velvet-shrine.json' },
  { id: 'arcology', label: 'BLACKSPIRE ARCOLOGY', file: '/examples/blackspire-arcology.json' },
  { id: 'cathedral', label: 'GHOST CATHEDRAL', file: '/examples/ghost-cathedral.json' },
];

export function ExamplesQuickLoad() {
  const onLoad = async (file: string, label: string) => {
    const ok = await importSaveFromUrlWithLoading(file, label);
    if (ok) toast.success(`Loaded example: ${label}`);
    else toast.error('Failed to load example');
  };

  return (
    <div className="absolute bottom-12 left-4 z-30 panel px-2 py-1.5 corner-bracket">
      <div className="terminal text-[10px] text-cyan-glow/55 mb-1">// EXAMPLE VAULTS</div>
      <div className="flex flex-col gap-1">
        {EXAMPLES.map((e) => (
          <motion.button
            key={e.id}
            whileHover={{ scale: 1.03, x: 2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onLoad(e.file, e.label)}
            className="btn-neon !text-[10px] !py-1 text-left"
          >
            {e.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
