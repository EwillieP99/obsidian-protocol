'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { getEngine, useEngineLayers } from '@/hooks/useEngine';
import { BLOCK_TYPES } from '@/lib/blocks';
import { brushCells, cellsAlongStroke } from '@/lib/brush';
import { transformCells } from '@/lib/artifacts/transform';

/**
 * Live brush preview. The whole assembly:
 *  - Per-cell ghost fills (translucent + wireframe outline)
 *  - Line-stroke path preview when dragging A→B
 *  - A shape-aware flat envelope wireframe (rectangle or circle) on the active layer
 *  - A face-normal indicator that orients to the hovered face when the brush size is 0
 */
export function Cursor() {
  const hoverCell = useUIStore((s) => s.hoverCell);
  const hoverNormal = useUIStore((s) => s.hoverNormal);
  const brush = useUIStore((s) => s.brush);
  const activeBlock = useUIStore((s) => s.activeBlock);
  const strokePreviewStart = useUIStore((s) => s.strokePreviewStart);
  const strokePreviewEnd = useUIStore((s) => s.strokePreviewEnd);
  const stampArtifact = useUIStore((s) => s.stampArtifact);
  const stampTransform = useUIStore((s) => s.stampTransform);
  const { activeLayer } = useEngineLayers();
  const groupRef = useRef<THREE.Group>(null);

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

  const rectWireGeom = useMemo(() => new THREE.BoxGeometry(1, 0.05, 1), []);
  const envelopeWireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, wireframe: true, transparent: true, opacity: 0.6, depthTest: false, toneMapped: false,
  }), []);
  const circleRingMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x00f9ff, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
  }), []);

  const circleRingGeom = useMemo(() => new THREE.RingGeometry(0.9, 1.0, 36), []);

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
      rectWireGeom.dispose();
      envelopeWireMat.dispose();
      circleRingGeom.dispose();
      circleRingMat.dispose();
      normalGeom.dispose();
      normalMat.dispose();
    };
  }, [cellGeom, ghostMat, wireMat, eraseMat, rectWireGeom, envelopeWireMat, circleRingGeom, circleRingMat, normalGeom, normalMat]);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 4) * 0.022;
      groupRef.current.scale.setScalar(s);
    }
  });

  const linePreview =
    brush.stroke === 'line' &&
    strokePreviewStart &&
    strokePreviewEnd &&
    brush.mode !== 'select' &&
    brush.mode !== 'eyedropper' &&
    !stampArtifact;

  if (!hoverCell && !linePreview && !stampArtifact) return null;

  const isErase = brush.mode === 'erase';
  const wf = isErase ? eraseMat : wireMat;

  let cells: Array<[number, number, number]> = [];
  let envelopeCenter: [number, number, number] | null = null;

  if (stampArtifact && hoverCell) {
    const [ax, ay, az] = hoverCell;
    const transformed = transformCells(stampArtifact.cells, stampTransform);
    cells = transformed.map((c) => [ax + c.dx, ay + c.dy, az + c.dz] as [number, number, number]);
    envelopeCenter = hoverCell;
    const firstBlock = transformed.find((c) => c.blockId)?.blockId ?? activeBlock;
    const c = new THREE.Color(BLOCK_TYPES[firstBlock].emissive);
    ghostMat.color = c;
    envelopeWireMat.color = c;
    circleRingMat.color = c;
  } else if (linePreview) {
    cells = cellsAlongStroke(strokePreviewStart, strokePreviewEnd, brush, activeBlock);
    envelopeCenter = strokePreviewEnd;
  } else if (hoverCell) {
    const [cx, cy, cz] = hoverCell;
    const editingExisting =
      (brush.mode === 'erase' || brush.mode === 'replace' || brush.mode === 'eyedropper') &&
      !!getEngine().getBlock(cx, cy, cz);
    const previewY = editingExisting ? cy : activeLayer;
    const previewCell: [number, number, number] = [cx, previewY, cz];
    cells = brush.size === 0 ? [previewCell] : brushCells(cx, previewY, cz, brush);
    envelopeCenter = [cx, previewY, cz];
  }

  if (cells.length === 0) return null;

  if (!isErase) {
    const c = new THREE.Color(BLOCK_TYPES[activeBlock].emissive);
    ghostMat.color = c;
    envelopeWireMat.color = c;
    circleRingMat.color = c;
  } else {
    envelopeWireMat.color.set(0xff2a4d);
    circleRingMat.color.set(0xff2a4d);
  }

  const VISIBLE_CAP = 64;
  const visibleCells = cells.length <= VISIBLE_CAP
    ? cells
    : cells.filter((_, i) => i % Math.ceil(cells.length / VISIBLE_CAP) === 0);

  const normalQuat = new THREE.Quaternion();
  if (hoverNormal) {
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(...hoverNormal).normalize();
    normalQuat.setFromUnitVectors(up, dir);
  }

  const [cx, cy, cz] = envelopeCenter ?? hoverCell ?? [0, 0, 0];
  const normalPos: [number, number, number] = hoverNormal
    ? [cx + hoverNormal[0] * 0.55, cy + hoverNormal[1] * 0.55, cz + hoverNormal[2] * 0.55]
    : [cx, cy + 0.55, cz];

  const rectScale = brush.size * 2 + 1;

  return (
    <group ref={groupRef}>
      {visibleCells.map(([x, y, z]) => (
        <group key={`${x},${y},${z}`} position={[x, y, z]}>
          <mesh geometry={cellGeom} material={isErase ? eraseMat : ghostMat} />
          <mesh geometry={cellGeom} material={wf} renderOrder={999} />
        </group>
      ))}

      {brush.size > 0 && brush.shape === 'rectangle' && envelopeCenter && (
        <mesh
          position={envelopeCenter}
          scale={[rectScale, 1, rectScale]}
          geometry={rectWireGeom}
          material={envelopeWireMat}
          renderOrder={998}
        />
      )}
      {brush.size > 0 && brush.shape === 'circle' && envelopeCenter && (
        <mesh
          position={envelopeCenter}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={brush.size + 0.5}
          geometry={circleRingGeom}
          material={circleRingMat}
          renderOrder={998}
        />
      )}

      {!linePreview && brush.size === 0 && hoverNormal && hoverCell && (
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
