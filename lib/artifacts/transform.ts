import type { ArtifactCell } from '@/lib/artifacts';

export interface StampTransform {
  /** Quarter-turns clockwise when viewed from +Y (0–3). */
  rotation: 0 | 1 | 2 | 3;
  mirrorX: boolean;
  mirrorZ: boolean;
}

export const DEFAULT_STAMP_TRANSFORM: StampTransform = {
  rotation: 0,
  mirrorX: false,
  mirrorZ: false,
};

function rotateCell(dx: number, dz: number, turns: number): [number, number] {
  let x = dx;
  let z = dz;
  for (let i = 0; i < (turns & 3); i++) {
    const nx = -z;
    z = x;
    x = nx;
  }
  return [x, z];
}

/** Apply stamp rotation + mirror to artifact cells (does not mutate input). */
export function transformCells(
  cells: ArtifactCell[],
  { rotation, mirrorX, mirrorZ }: StampTransform,
): ArtifactCell[] {
  return cells.map((c) => {
    let [dx, dz] = rotateCell(c.dx, c.dz, rotation);
    if (mirrorX) dx = -dx;
    if (mirrorZ) dz = -dz;
    return { ...c, dx, dy: c.dy, dz };
  });
}

export function rotateStampTransform(t: StampTransform): StampTransform {
  return { ...t, rotation: ((t.rotation + 1) % 4) as 0 | 1 | 2 | 3 };
}

export function toggleMirrorX(t: StampTransform): StampTransform {
  return { ...t, mirrorX: !t.mirrorX };
}

export function toggleMirrorZ(t: StampTransform): StampTransform {
  return { ...t, mirrorZ: !t.mirrorZ };
}
