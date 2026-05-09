import type { Brush, BlockId } from '@/types';
import { WORLD_HEIGHT, HALF } from '@/lib/constants';

/** Generate the cells touched by a brush centered on (cx,cy,cz). */
export function brushCells(cx: number, cy: number, cz: number, brush: Brush): Array<[number, number, number]> {
  const r = brush.size;
  const cells: Array<[number, number, number]> = [];
  if (r === 0) return [[cx, cy, cz]];

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        if (brush.shape === 'sphere') {
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r * r) continue;
        } else if (brush.shape === 'plane') {
          if (dy !== 0) continue;
        }
        if (brush.randomness > 0 && Math.random() < brush.randomness) continue;
        cells.push([cx + dx, cy + dy, cz + dz]);
      }
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
