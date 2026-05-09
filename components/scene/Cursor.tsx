'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { BLOCK_TYPES } from '@/lib/blocks';
import { brushCells } from '@/lib/brush';

/**
 * Live brush preview. The whole assembly:
 *  - Per-cell ghost fills (translucent + wireframe outline)
 *  - A shape-aware "envelope" wireframe (sphere or plane disc) overlaid on the bounding cells
 *    so users can see the full extent of large brushes at a glance
 *  - A face-normal indicator that orients to the hovered face when the brush size is 0
 */
export function Cursor() {
  const hoverCell = useUIStore((s) => s.hoverCell);
  const hoverNormal = useUIStore((s) => s.hoverNormal);
  const brush = useUIStore((s) => s.brush);
  const activeBlock = useUIStore((s) => s.activeBlock);
  const groupRef = useRef<THREE.Group>(null);

  // Per-instance ghost mesh (matches voxel cell exactly)
  const cellGeom = useMemo(() => new THREE.BoxGeometry(1.02, 1.02, 1.02), []);
  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide,
  }), []);
  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, wireframe: true, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false,
  }), []);
  const eraseMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xff2a4d, wireframe: true, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false,
  }), []);

  // Envelope geometries (shared)
  const sphereWireGeom = useMemo(() => new THREE.SphereGeometry(1, 18, 12), []);
  const sphereWireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, wireframe: true, transparent: true, opacity: 0.6, depthTest: false, toneMapped: false,
  }), []);
  const planeRingGeom = useMemo(() => new THREE.RingGeometry(0.9, 1.0, 36), []);
  const planeRingMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
  }), []);

  // Normal indicator — small arrow plate aligned to the hovered face
  const normalGeom = useMemo(() => new THREE.PlaneGeometry(0.5, 0.05), []);
  const normalMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xff00aa, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, toneMapped: false,
  }), []);

  useEffect(() => {
    return () => {
      cellGeom.dispose();
      ghostMat.dispose();
      wireMat.dispose();
      eraseMat.dispose();
      sphereWireGeom.dispose();
      sphereWireMat.dispose();
      planeRingGeom.dispose();
      planeRingMat.dispose();
      normalGeom.dispose();
      normalMat.dispose();
    };
  }, [cellGeom, ghostMat, wireMat, eraseMat, sphereWireGeom, sphereWireMat, planeRingGeom, planeRingMat, normalGeom, normalMat]);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      // Subtle pulse so the preview reads as "live"
      const s = 1 + Math.sin(t * 4) * 0.022;
      groupRef.current.scale.setScalar(s);
    }
  });

  if (!hoverCell) return null;

  const [cx, cy, cz] = hoverCell;
  const cells = brush.size === 0 ? [hoverCell] : brushCells(cx, cy, cz, brush);
  if (cells.length === 0) return null;
  const isErase = brush.mode === 'erase';
  const wf = isErase ? eraseMat : wireMat;
  if (!isErase) {
    const c = new THREE.Color(BLOCK_TYPES[activeBlock].emissive);
    ghostMat.color = c;
    sphereWireMat.color = c;
    planeRingMat.color = c;
  } else {
    sphereWireMat.color.set(0xff2a4d);
    planeRingMat.color.set(0xff2a4d);
  }

  // Cap visible ghost cells for very large brushes — keep the cost predictable.
  const VISIBLE_CAP = 64;
  const visibleCells = cells.length <= VISIBLE_CAP
    ? cells
    : cells.filter((_, i) => i % Math.ceil(cells.length / VISIBLE_CAP) === 0);

  // Normal indicator position: nudge by hover normal so the marker sits on the hovered face
  const normalQuat = new THREE.Quaternion();
  if (hoverNormal) {
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(...hoverNormal).normalize();
    normalQuat.setFromUnitVectors(up, dir);
  }
  const normalPos: [number, number, number] = hoverNormal
    ? [cx + hoverNormal[0] * 0.55, cy + hoverNormal[1] * 0.55, cz + hoverNormal[2] * 0.55]
    : [cx, cy + 0.55, cz];

  return (
    <group ref={groupRef}>
      {visibleCells.map(([x, y, z]) => (
        <group key={`${x},${y},${z}`} position={[x, y, z]}>
          <mesh geometry={cellGeom} material={isErase ? eraseMat : ghostMat} />
          <mesh geometry={cellGeom} material={wf} renderOrder={999} />
        </group>
      ))}

      {/* Shape envelope — only for size > 0 */}
      {brush.size > 0 && brush.shape === 'sphere' && (
        <mesh
          position={[cx, cy, cz]}
          scale={brush.size + 0.5}
          geometry={sphereWireGeom}
          material={sphereWireMat}
          renderOrder={998}
        />
      )}
      {brush.size > 0 && brush.shape === 'plane' && (
        <mesh
          position={[cx, cy, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={brush.size + 0.5}
          geometry={planeRingGeom}
          material={planeRingMat}
          renderOrder={998}
        />
      )}

      {/* Face-normal indicator (only when single-cell brush; for big brushes it's noisy) */}
      {brush.size === 0 && hoverNormal && (
        <mesh
          position={normalPos}
          quaternion={normalQuat}
          geometry={normalGeom}
          material={normalMat}
          renderOrder={999}
        />
      )}
    </group>
  );
}
