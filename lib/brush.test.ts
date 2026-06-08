import { describe, it, expect } from 'vitest';
import { voxelLine3D, cellsAlongPath } from '@/lib/brush';
import type { Brush } from '@/types';

const sizeZeroBrush: Brush = {
  mode: 'paint',
  stroke: 'line',
  shape: 'rectangle',
  size: 0,
  randomness: 0,
  smartConnect: false,
};

describe('brush geometry', () => {
  it('voxelLine3D returns endpoints and a straight path', () => {
    const path = voxelLine3D([0, 0, 0], [3, 0, 0]);
    expect(path[0]).toEqual([0, 0, 0]);
    expect(path[path.length - 1]).toEqual([3, 0, 0]);
    expect(path.length).toBe(4);
  });

  it('voxelLine3D handles diagonal 3D lines', () => {
    const path = voxelLine3D([0, 0, 0], [2, 2, 2]);
    expect(path[0]).toEqual([0, 0, 0]);
    expect(path[path.length - 1]).toEqual([2, 2, 2]);
    expect(path.length).toBeGreaterThan(2);
  });

  it('cellsAlongPath traces a closed rectangle perimeter without dupes', () => {
    // Four corners back to start = a 4x4 box outline on the y=0 plane.
    const cells = cellsAlongPath(
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 0, 4],
        [0, 0, 4],
        [0, 0, 0],
      ],
      sizeZeroBrush,
    );
    const keys = cells.map(([x, y, z]) => `${x},${y},${z}`);
    // 4 sides of length 4 share their corners → 16 unique perimeter cells.
    expect(new Set(keys).size).toBe(keys.length);
    expect(cells.length).toBe(16);
    // Interior stays empty.
    expect(keys).not.toContain('2,0,2');
  });

  it('cellsAlongPath degenerates to a single footprint for one vertex', () => {
    expect(cellsAlongPath([[1, 2, 3]], sizeZeroBrush)).toEqual([[1, 2, 3]]);
    expect(cellsAlongPath([], sizeZeroBrush)).toEqual([]);
  });
});
