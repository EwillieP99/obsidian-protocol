import { describe, it, expect } from 'vitest';
import { transformCells, rotateStampTransform } from '@/lib/artifacts/transform';
import type { ArtifactCell } from '@/lib/artifacts';

describe('artifact transform', () => {
  const cells: ArtifactCell[] = [
    { dx: 1, dy: 0, dz: 0, blockId: 'obsidian', layer: 0 },
    { dx: 0, dy: 0, dz: 1, blockId: 'neon-cyan', layer: 0 },
  ];

  it('rotates stamp cells 90°', () => {
    const out = transformCells(cells, { rotation: 1, mirrorX: false, mirrorZ: false });
    expect(out[0].dx === 0).toBe(true);
    expect(out[0].dz).toBe(1);
  });

  it('mirrors on X axis', () => {
    const out = transformCells(cells, { rotation: 0, mirrorX: true, mirrorZ: false });
    expect(out[0].dx).toBe(-1);
  });

  it('rotateStampTransform increments quarter turns', () => {
    expect(rotateStampTransform({ rotation: 3, mirrorX: false, mirrorZ: false }).rotation).toBe(0);
  });
});
