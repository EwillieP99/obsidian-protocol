'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { getEngine } from '@/hooks/useEngine';
import { countFilledInSelection, selectionBounds } from '@/lib/selection';

export function SelectionHud() {
  const brushMode = useUIStore((s) => s.brush.mode);
  const selectionStart = useUIStore((s) => s.selectionStart);
  const selectionEnd = useUIStore((s) => s.selectionEnd);
  const hoverCell = useUIStore((s) => s.hoverCell);
  const [filled, setFilled] = useState(0);

  const end = selectionEnd ?? (brushMode === 'select' ? hoverCell : null);

  useEffect(() => {
    if (brushMode !== 'select' || !selectionStart) {
      setFilled(0);
      return;
    }
    const bounds = selectionBounds(selectionStart, end);
    const id = setTimeout(
      () => setFilled(countFilledInSelection(bounds, (x, y, z) => getEngine().getBlock(x, y, z) ?? null)),
      80,
    );
    return () => clearTimeout(id);
  }, [brushMode, selectionStart, selectionEnd, hoverCell, end]);

  if (brushMode !== 'select' || !selectionStart) return null;

  const b = selectionBounds(selectionStart, end);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 panel px-3 py-2 text-xs terminal pointer-events-none">
      <span className="neon-text-magenta">SELECT</span>
      <span className="text-cyan-glow/80 ml-2">
        {b.width}×{b.height}×{b.depth}
      </span>
      <span className="text-cyan-glow/60 ml-2">vol {b.volume}</span>
      <span className="text-cyan-glow/60 ml-2">blocks {filled}</span>
    </div>
  );
}
