import { describe, it, expect } from 'vitest';
import { selectionBounds } from '@/lib/selection';

describe('selection bounds', () => {
  it('computes AABB dimensions from two corners', () => {
    const b = selectionBounds([0, 0, 0], [2, 1, 3]);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(2);
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(1);
    expect(b.width).toBe(3);
    expect(b.height).toBe(2);
    expect(b.depth).toBe(4);
    expect(b.volume).toBe(24);
  });

  it('treats null end as single-cell selection', () => {
    const b = selectionBounds([1, 2, 3], null);
    expect(b.width).toBe(1);
    expect(b.volume).toBe(1);
  });
});
