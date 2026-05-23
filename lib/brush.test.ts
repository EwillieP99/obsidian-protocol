import { describe, it, expect } from 'vitest';
import { voxelLine3D } from '@/lib/brush';

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
});
