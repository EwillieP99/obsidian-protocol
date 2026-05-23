export interface SelectionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
  volume: number;
}

export function selectionBounds(
  start: [number, number, number],
  end: [number, number, number] | null,
): SelectionBounds {
  const endPt = end ?? start;
  const minX = Math.min(start[0], endPt[0]);
  const maxX = Math.max(start[0], endPt[0]);
  const minY = Math.min(start[1], endPt[1]);
  const maxY = Math.max(start[1], endPt[1]);
  const minZ = Math.min(start[2], endPt[2]);
  const maxZ = Math.max(start[2], endPt[2]);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const depth = maxZ - minZ + 1;
  return { minX, maxX, minY, maxY, minZ, maxZ, width, height, depth, volume: width * height * depth };
}

/** Count non-air blocks inside the AABB (sync read; debounce in UI). */
export function countFilledInSelection(
  bounds: SelectionBounds,
  getBlock: (x: number, y: number, z: number) => string | null,
): number {
  let n = 0;
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        if (getBlock(x, y, z)) n++;
      }
    }
  }
  return n;
}
