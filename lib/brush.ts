import type { Brush, BlockId, Vec3 } from '@/types';
import { WORLD_HEIGHT, HALF } from '@/lib/constants';

const SMART_CONNECT_BLOCKS: BlockId[] = ['power-line', 'circuit'];

/** 3D Bresenham — true straight line through the voxel grid. */
export function voxelLine3D(
  a: Vec3,
  b: Vec3,
): Array<[number, number, number]> {
  let [x, y, z] = a;
  const [x1, y1, z1] = b;
  const dx = Math.abs(x1 - x);
  const dy = Math.abs(y1 - y);
  const dz = Math.abs(z1 - z);
  const xs = x1 > x ? 1 : -1;
  const ys = y1 > y ? 1 : -1;
  const zs = z1 > z ? 1 : -1;
  const path: Array<[number, number, number]> = [[x, y, z]];

  if (dx >= dy && dx >= dz) {
    let p1 = 2 * dy - dx;
    let p2 = 2 * dz - dx;
    while (x !== x1) {
      x += xs;
      if (p1 >= 0) { y += ys; p1 -= 2 * dx; }
      if (p2 >= 0) { z += zs; p2 -= 2 * dx; }
      p1 += 2 * dy;
      p2 += 2 * dz;
      path.push([x, y, z]);
    }
  } else if (dy >= dx && dy >= dz) {
    let p1 = 2 * dx - dy;
    let p2 = 2 * dz - dy;
    while (y !== y1) {
      y += ys;
      if (p1 >= 0) { x += xs; p1 -= 2 * dy; }
      if (p2 >= 0) { z += zs; p2 -= 2 * dy; }
      p1 += 2 * dx;
      p2 += 2 * dz;
      path.push([x, y, z]);
    }
  } else {
    let p1 = 2 * dy - dz;
    let p2 = 2 * dx - dz;
    while (z !== z1) {
      z += zs;
      if (p1 >= 0) { y += ys; p1 -= 2 * dz; }
      if (p2 >= 0) { x += xs; p2 -= 2 * dz; }
      p1 += 2 * dy;
      p2 += 2 * dx;
      path.push([x, y, z]);
    }
  }
  return path;
}

function strokeCenters(
  start: Vec3,
  end: Vec3,
  brush: Brush,
  activeBlock?: BlockId,
): Array<[number, number, number]> {
  const useManhattan =
    brush.smartConnect &&
    activeBlock !== undefined &&
    SMART_CONNECT_BLOCKS.includes(activeBlock);
  return useManhattan ? linePath(start, end) : voxelLine3D(start, end);
}

/** Union of brush footprints along a stroke path (deduped). */
export function cellsAlongStroke(
  start: Vec3,
  end: Vec3,
  brush: Brush,
  activeBlock?: BlockId,
): Array<[number, number, number]> {
  const centers = strokeCenters(start, end, brush, activeBlock);
  const seen = new Set<string>();
  const out: Array<[number, number, number]> = [];

  for (const [cx, cy, cz] of centers) {
    const footprint =
      brush.size === 0
        ? [[cx, cy, cz] as [number, number, number]]
        : brushCells(cx, cy, cz, brush);
    for (const cell of footprint) {
      const k = `${cell[0]},${cell[1]},${cell[2]}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(cell);
      }
    }
  }
  return out.filter(([x, y, z]) =>
    x >= -HALF && x < HALF && z >= -HALF && z < HALF && y >= 0 && y < WORLD_HEIGHT,
  );
}

/** Generate the cells touched by a flat brush stamp centered on (cx,cy,cz). */
export function brushCells(cx: number, cy: number, cz: number, brush: Brush): Array<[number, number, number]> {
  const r = brush.size;
  const cells: Array<[number, number, number]> = [];
  if (r === 0) return [[cx, cy, cz]];

  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (brush.shape === 'circle' && dx * dx + dz * dz > r * r) continue;
      if (brush.randomness > 0 && Math.random() < brush.randomness) continue;
      cells.push([cx + dx, cy, cz + dz]);
    }
  }
  return cells.filter(([x, y, z]) =>
    x >= -HALF && x < HALF && z >= -HALF && z < HALF && y >= 0 && y < WORLD_HEIGHT,
  );
}

/** Smart-connect for power-line/circuit: snap a path between two cells along axes. */
export function linePath(
  a: [number, number, number],
  b: [number, number, number],
): Array<[number, number, number]> {
  const path: Array<[number, number, number]> = [];
  let [x, y, z] = a;
  const [tx, ty, tz] = b;
  while (x !== tx) { path.push([x, y, z]); x += Math.sign(tx - x); }
  while (z !== tz) { path.push([x, y, z]); z += Math.sign(tz - z); }
  while (y !== ty) { path.push([x, y, z]); y += Math.sign(ty - y); }
  path.push([tx, ty, tz]);
  return path;
}

export function operationsForBrush(
  cells: Array<[number, number, number]>,
  block: BlockId,
  mode: Brush['mode'],
  existing: (x: number, y: number, z: number) => BlockId | undefined,
  pickReplaceTarget?: BlockId,
): Array<{ x: number; y: number; z: number; block: BlockId | null }> {
  const ops: Array<{ x: number; y: number; z: number; block: BlockId | null }> = [];
  for (const [x, y, z] of cells) {
    const cur = existing(x, y, z);
    if (mode === 'paint') {
      ops.push({ x, y, z, block });
    } else if (mode === 'erase') {
      if (cur) ops.push({ x, y, z, block: null });
    } else if (mode === 'fill') {
      if (!cur) ops.push({ x, y, z, block });
    } else if (mode === 'replace') {
      if (cur && (!pickReplaceTarget || cur === pickReplaceTarget)) {
        ops.push({ x, y, z, block });
      }
    }
  }
  return ops;
}
