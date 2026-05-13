'use client';

import * as THREE from 'three';
import { useCallback, useMemo, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { useVoxelStore } from '@/stores/voxelStore';
import { useEffectsStore } from '@/stores/effectsStore';
import { getEngine } from '@/hooks/useEngine';
import { brushCells, operationsForBrush } from '@/lib/brush';
import { WORLD_SIZE, WORLD_HEIGHT, FLOOR_Y, HALF } from '@/lib/constants';
import { toast } from 'sonner';

/**
 * Wraps voxels + floor in a group whose pointer handlers compute the targeted cell.
 *
 * R3F events bubble through Object3D parents — descendant meshes (InstancedMesh voxels,
 * the catch-all floor plane) all dispatch into this group's handlers, where we look at
 * `e.object` and the face normal to disambiguate "place adjacent" vs "edit existing".
 */
export function Interaction({ children }: { children: React.ReactNode }) {
  const isDown = useRef(false);
  const lastCell = useRef<string | null>(null);
  const dragMode = useRef<'paint' | 'erase' | null>(null);

  const planeGeom = useMemo(() => new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), []);
  const planeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    [],
  );

  const computeCell = useCallback((e: ThreeEvent<PointerEvent>) => {
    const point = e.point;
    const face = e.face;
    const obj = e.object;

    if (obj instanceof THREE.InstancedMesh && face) {
      const normal = face.normal.clone();
      const inside = point.clone().sub(normal.clone().multiplyScalar(0.001));
      const outside = point.clone().add(normal.clone().multiplyScalar(0.001));
      return {
        insideCell: [Math.round(inside.x), Math.round(inside.y), Math.round(inside.z)] as [number, number, number],
        outsideCell: [Math.round(outside.x), Math.round(outside.y), Math.round(outside.z)] as [number, number, number],
        normal: [normal.x, normal.y, normal.z] as [number, number, number],
      };
    }
    // Floor plane
    const cell: [number, number, number] = [Math.round(point.x), 0, Math.round(point.z)];
    return { insideCell: cell, outsideCell: cell, normal: [0, 1, 0] as [number, number, number] };
  }, []);

  const inBounds = (x: number, y: number, z: number) =>
    x >= -HALF && x < HALF && z >= -HALF && z < HALF && y >= 0 && y < WORLD_HEIGHT;

  const apply = useCallback((cell: [number, number, number]) => {
    const [cx, cy, cz] = cell;
    const { brush, activeBlock } = useUIStore.getState();
    const store = useVoxelStore.getState();

    if (brush.mode === 'eyedropper') {
      const cur = store.getBlock(cx, cy, cz);
      if (cur) {
        useUIStore.getState().setActiveBlock(cur);
        toast.success(`Sampled ${cur}`, { description: 'Block injected into active palette slot.' });
      }
      return;
    }

    const cells = brush.size === 0 ? [[cx, cy, cz] as [number, number, number]] : brushCells(cx, cy, cz, brush);
    const inBoundsFiltered = cells.filter(([x, y, z]) => inBounds(x, y, z));
    const effectiveMode =
      dragMode.current === 'erase' ? 'erase' : brush.mode;

    let pickReplaceTarget: ReturnType<typeof store.getBlock> | undefined;
    if (effectiveMode === 'replace') {
      pickReplaceTarget = store.getBlock(cx, cy, cz);
      if (!pickReplaceTarget) return;
    }

    const ops = operationsForBrush(
      inBoundsFiltered,
      activeBlock,
      effectiveMode,
      (x, y, z) => store.getBlock(x, y, z),
      pickReplaceTarget,
    );
    if (ops.length) {
      const label =
        effectiveMode === 'erase' ? 'Purge' :
        effectiveMode === 'fill' ? 'Fill' :
        effectiveMode === 'replace' ? 'Replace' :
        `Place ${activeBlock}`;
      getEngine().applyOps(
        ops.map((o) => ({ x: o.x, y: o.y, z: o.z, blockId: o.block, layer: o.y })),
        label,
      );
    }
  }, []);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const { outsideCell, insideCell, normal } = computeCell(e);
    const { brush } = useUIStore.getState();
    const useInside =
      brush.mode === 'erase' ||
      brush.mode === 'replace' ||
      brush.mode === 'eyedropper' ||
      dragMode.current === 'erase';
    const target = useInside ? insideCell : outsideCell;

    if (!inBounds(...target)) {
      useUIStore.getState().setHover(null, null);
      return;
    }
    useUIStore.getState().setHover(target, normal);

    if (isDown.current) {
      const k = `${target[0]},${target[1]},${target[2]}`;
      if (lastCell.current !== k) {
        lastCell.current = k;
        apply(target);
      }
    }
  }, [apply, computeCell]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.stopPropagation();
    isDown.current = true;
    dragMode.current = e.button === 2 ? 'erase' : 'paint';

    const { outsideCell, insideCell } = computeCell(e);
    const { brush } = useUIStore.getState();
    const useInside =
      brush.mode === 'erase' ||
      brush.mode === 'replace' ||
      brush.mode === 'eyedropper' ||
      dragMode.current === 'erase';
    const target = useInside ? insideCell : outsideCell;
    if (!inBounds(...target)) return;
    lastCell.current = `${target[0]},${target[1]},${target[2]}`;
    apply(target);
  }, [apply, computeCell]);

  const handlePointerUp = useCallback(() => {
    isDown.current = false;
    lastCell.current = null;
    dragMode.current = null;
  }, []);

  const handlePointerLeave = useCallback(() => {
    useUIStore.getState().setHover(null, null);
    isDown.current = false;
    lastCell.current = null;
    dragMode.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    // Only react to double-clicks on actual blocks, not the floor.
    if (!(e.object instanceof THREE.InstancedMesh) || !e.face) return;
    e.stopPropagation();
    const point = e.point;
    const inside = point.clone().sub(e.face.normal.clone().multiplyScalar(0.001));
    const target: [number, number, number] = [Math.round(inside.x), Math.round(inside.y), Math.round(inside.z)];
    if (!inBounds(...target)) return;
    useEffectsStore.getState().setFocus(target);
  }, []);

  return (
    <group
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.nativeEvent.preventDefault()}
    >
      {/* Catch-all floor for empty cells. Invisible but raycasts. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, FLOOR_Y, 0]}
        geometry={planeGeom}
        material={planeMat}
      />
      {children}
    </group>
  );
}
