'use client';

import * as THREE from 'three';
import { useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { selectionBounds } from '@/lib/selection';

/**
 * Visual wireframe AABB for region select mode. Read-only — no mutations.
 */
export function SelectionBox() {
  const selectionStart = useUIStore((s) => s.selectionStart);
  const selectionEnd = useUIStore((s) => s.selectionEnd);
  const hoverCell = useUIStore((s) => s.hoverCell);
  const brushMode = useUIStore((s) => s.brush.mode);

  const boxGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xff2e88,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        toneMapped: false,
      }),
    [],
  );

  if (brushMode !== 'select' || !selectionStart) return null;

  const end = selectionEnd ?? hoverCell ?? selectionStart;
  const b = selectionBounds(selectionStart, end);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  return (
    <mesh
      position={[cx, cy, cz]}
      scale={[b.width, b.height, b.depth]}
      geometry={boxGeom}
      material={mat}
      renderOrder={997}
    />
  );
}
