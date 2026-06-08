'use client';

import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { useEffectsStore } from '@/stores/effectsStore';
import { getEngine, useEngineLayers } from '@/hooks/useEngine';
import { brushCells, cellsAlongPath, operationsForBrush } from '@/lib/brush';
import { WORLD_SIZE, WORLD_HEIGHT, FLOOR_Y, HALF } from '@/lib/constants';
import type { BrushMode } from '@/types';
import { toast } from 'sonner';
import { transformCells } from '@/lib/artifacts/transform';

function isRightPointer(e: ThreeEvent<PointerEvent>) {
  return e.button === 2 || (e.buttons & 2) !== 0;
}

function isInteractionBlocked(): boolean {
  return useUIStore.getState().loading !== null;
}

/** Snap freehand steps to the dominant axis from a reference cell. */
function constrainToAxis(
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number] {
  const dx = Math.abs(to[0] - from[0]);
  const dy = Math.abs(to[1] - from[1]);
  const dz = Math.abs(to[2] - from[2]);
  if (dx >= dy && dx >= dz) return [to[0], from[1], from[2]];
  if (dy >= dx && dy >= dz) return [from[0], to[1], from[2]];
  return [from[0], from[1], to[2]];
}

/**
 * Snap vacant brush targets to the active layer stratum (world Y = layer id).
 * Preserve picked Y when editing an existing voxel (erase / replace / sample).
 */
function resolveBrushCell(
  raw: [number, number, number],
  mode: BrushMode,
): [number, number, number] {
  const [x, y, z] = raw;
  const activeLayer = getEngine().getActiveLayer();

  if (
    (mode === 'erase' || mode === 'replace' || mode === 'eyedropper') &&
    getEngine().getBlock(x, y, z)
  ) {
    return [x, y, z];
  }

  return [x, activeLayer, z];
}

/**
 * Wraps voxels + floor in a group whose pointer handlers compute the targeted cell.
 *
 * R3F events bubble through Object3D parents — descendant meshes (InstancedMesh voxels,
 * the catch-all floor plane) all dispatch into this group's handlers, where we look at
 * `e.object` and the face normal to disambiguate "place adjacent" vs "edit existing".
 */
export function Interaction({ children }: { children: React.ReactNode }) {
  const isDown = useRef(false);
  const lastCell = useRef<[number, number, number] | null>(null);
  const strokeStart = useRef<[number, number, number] | null>(null);
  const freehandCells = useRef<Array<[number, number, number]>>([]);
  // Committed corners of an in-progress line. [start] for a plain line; each
  // Shift/Ctrl tap appends the locked corner so subsequent segments turn from it.
  const lineVertices = useRef<Array<[number, number, number]>>([]);

  const { activeLayer, layers } = useEngineLayers();
  const layersPanelOpen = useUIStore((s) => s.panels.layers);
  const soloLayerId = layers.find((l) => l.solo)?.id;

  const planeGeom = useMemo(() => new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), []);
  const planeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    [],
  );
  const guideMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xff00aa,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
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

    const mesh = obj as THREE.Mesh;
    const stratumY = Math.round(mesh.position.y - FLOOR_Y);
    const cell: [number, number, number] = [Math.round(point.x), stratumY, Math.round(point.z)];
    return { insideCell: cell, outsideCell: cell, normal: [0, 1, 0] as [number, number, number] };
  }, []);

  const inBounds = (x: number, y: number, z: number) =>
    x >= -HALF && x < HALF && z >= -HALF && z < HALF && y >= 0 && y < WORLD_HEIGHT;

  const pickRawCell = useCallback(
    (brushMode: BrushMode, outsideCell: [number, number, number], insideCell: [number, number, number]) => {
      const useInside =
        brushMode === 'erase' ||
        brushMode === 'replace' ||
        brushMode === 'eyedropper';
      return useInside ? insideCell : outsideCell;
    },
    [],
  );

  const applyCells = useCallback(
    (cells: Array<[number, number, number]>, label?: string) => {
      if (cells.length === 0) return;

      const { brush, activeBlock } = useUIStore.getState();
      const inBoundsFiltered = cells.filter(([x, y, z]) => inBounds(x, y, z));

      let pickReplaceTarget: import('@/types').BlockId | undefined;
      if (brush.mode === 'replace') {
        const [cx, cy, cz] = inBoundsFiltered[0] ?? cells[0];
        pickReplaceTarget = getEngine().getBlock(cx, cy, cz);
        if (!pickReplaceTarget) return;
      }

      const ops = operationsForBrush(
        inBoundsFiltered,
        activeBlock,
        brush.mode,
        (x, y, z) => getEngine().getBlock(x, y, z),
        pickReplaceTarget,
      );
      if (ops.length) {
        const activeLayerId = getEngine().getActiveLayer();
        const effectiveLabel =
          label ??
          (brush.mode === 'erase' ? 'Purge' :
          brush.mode === 'fill' ? 'Fill' :
          brush.mode === 'replace' ? 'Replace' :
          `Place ${activeBlock}`);
        getEngine().applyOps(
          ops.map((o) => ({ x: o.x, y: o.y, z: o.z, blockId: o.block, layer: activeLayerId })),
          effectiveLabel,
        );
      }
    },
    [],
  );

  const applyEyedropper = useCallback((cell: [number, number, number]) => {
    const [cx, cy, cz] = resolveBrushCell(cell, 'eyedropper');
    const cur = getEngine().getBlock(cx, cy, cz);
    if (cur) {
      useUIStore.getState().setActiveBlock(cur);
      toast.success(`Sampled ${cur}`, { description: 'Block injected into active palette slot.' });
    }
  }, []);

  const collectFreehandCell = useCallback((target: [number, number, number]) => {
    const { brush } = useUIStore.getState();
    const footprint =
      brush.size === 0
        ? [target]
        : brushCells(target[0], target[1], target[2], brush);
    const seen = new Set(freehandCells.current.map(([x, y, z]) => `${x},${y},${z}`));
    for (const cell of footprint) {
      const k = `${cell[0]},${cell[1]},${cell[2]}`;
      if (!seen.has(k)) {
        seen.add(k);
        freehandCells.current.push(cell);
      }
    }
  }, []);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (isRightPointer(e)) return;

    e.stopPropagation();
    const { outsideCell, insideCell, normal } = computeCell(e);
    const { brush } = useUIStore.getState();

    if (brush.mode === 'select') {
      if (inBounds(...insideCell)) {
        useUIStore.getState().setHover(insideCell, normal);
      }
      return;
    }

    const raw = pickRawCell(brush.mode, outsideCell, insideCell);
    let target = resolveBrushCell(raw, brush.mode);

    if (isDown.current && brush.stroke === 'freehand' && lastCell.current && e.shiftKey) {
      target = constrainToAxis(lastCell.current, target);
    }

    if (!inBounds(...target)) {
      useUIStore.getState().setHover(null, null);
      return;
    }
    useUIStore.getState().setHover(target, normal);

    if (isDown.current && brush.mode !== 'eyedropper') {
      if (brush.stroke === 'line') {
        const verts = lineVertices.current;
        if (verts.length > 0) {
          const anchor = verts[verts.length - 1];
          // Once a corner is locked we're drawing right angles, so snap the
          // live segment to the dominant axis. The first, un-cornered segment
          // stays free (diagonals allowed).
          const liveEnd = verts.length >= 2 ? constrainToAxis(anchor, target) : target;
          lastCell.current = liveEnd;
          useUIStore.getState().setStrokePreview([...verts, liveEnd]);
        }
      } else {
        const k = `${target[0]},${target[1]},${target[2]}`;
        const last = lastCell.current;
        const lastKey = last ? `${last[0]},${last[1]},${last[2]}` : null;
        if (lastKey !== k) {
          lastCell.current = target;
          collectFreehandCell(target);
        }
      }
    }
  }, [collectFreehandCell, computeCell, pickRawCell]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (isInteractionBlocked()) return;
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) return;

    const { stampArtifact, stampTransform } = useUIStore.getState();
    if (stampArtifact) {
      e.stopPropagation();
      const { outsideCell } = computeCell(e);
      const [ax, ay, az] = resolveBrushCell(outsideCell, 'paint');
      if (!inBounds(ax, ay, az)) return;
      const activeLayerId = getEngine().getActiveLayer();
      const soloLayer = getEngine().getLayers().find((l) => l.solo)?.id;
      const cells = transformCells(stampArtifact.cells, stampTransform);
      getEngine().applyOps(
        cells.map((c) => ({
          x: ax + c.dx,
          y: ay + c.dy,
          z: az + c.dz,
          blockId: c.blockId,
          layer: soloLayer !== undefined ? activeLayerId : c.layer,
        })),
        `Stamp ${stampArtifact.name}`,
      );
      return;
    }

    e.stopPropagation();

    const { brush } = useUIStore.getState();

    if (brush.mode === 'select') {
      const { insideCell } = computeCell(e);
      if (!inBounds(...insideCell)) return;
      const ui = useUIStore.getState();
      if (!ui.selectionStart) {
        ui.setSelectionStart(insideCell);
      } else {
        ui.setSelectionEnd(insideCell);
      }
      return;
    }

    const { outsideCell, insideCell } = computeCell(e);
    const raw = pickRawCell(brush.mode, outsideCell, insideCell);
    const target = resolveBrushCell(raw, brush.mode);
    if (!inBounds(...target)) return;

    if (brush.mode === 'eyedropper') {
      applyEyedropper(raw);
      return;
    }

    isDown.current = true;
    lastCell.current = target;
    freehandCells.current = [];

    if (brush.stroke === 'line') {
      strokeStart.current = target;
      lineVertices.current = [target];
      useUIStore.getState().setStrokePreview([target, target]);
    } else {
      strokeStart.current = null;
      lineVertices.current = [];
      useUIStore.getState().clearStrokePreview();
      collectFreehandCell(target);
    }
  }, [applyEyedropper, collectFreehandCell, computeCell, pickRawCell]);

  const finishStroke = useCallback(() => {
    if (!isDown.current) return;

    const { brush, activeBlock } = useUIStore.getState();

    if (brush.stroke === 'line' && strokeStart.current && brush.mode !== 'eyedropper' && brush.mode !== 'select') {
      const end = lastCell.current ?? strokeStart.current;
      const path = lineVertices.current.length > 0
        ? [...lineVertices.current, end]
        : [strokeStart.current, end];
      const cells = cellsAlongPath(path, brush, activeBlock);
      applyCells(cells, lineVertices.current.length >= 2 ? 'Polyline' : 'Line stroke');
    } else if (brush.stroke === 'freehand' && freehandCells.current.length > 0) {
      applyCells(freehandCells.current);
    }

    isDown.current = false;
    lastCell.current = null;
    strokeStart.current = null;
    freehandCells.current = [];
    lineVertices.current = [];
    useUIStore.getState().clearStrokePreview();
  }, [applyCells]);

  useEffect(() => {
    const onWindowPointerUp = () => finishStroke();
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => window.removeEventListener('pointerup', onWindowPointerUp);
  }, [finishStroke]);

  // Shift/Ctrl while dragging a line locks the current endpoint as a corner and
  // turns the next segment from it — letting you trace rectangles, L- and
  // U-shapes in one stroke. `e.repeat` guards against auto-repeat so a held key
  // commits exactly one corner.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key !== 'Shift' && e.key !== 'Control') return;
      if (!isDown.current) return;

      const { brush } = useUIStore.getState();
      if (brush.stroke !== 'line' || brush.mode === 'eyedropper' || brush.mode === 'select') return;

      const verts = lineVertices.current;
      const anchor = verts[verts.length - 1];
      const cursor = lastCell.current;
      if (!anchor || !cursor) return;

      const corner = constrainToAxis(anchor, cursor);
      // Ignore taps that haven't moved off the anchor — no zero-length corner.
      if (corner[0] === anchor[0] && corner[1] === anchor[1] && corner[2] === anchor[2]) return;

      verts.push(corner);
      strokeStart.current = corner;
      lastCell.current = corner;
      useUIStore.getState().setStrokePreview([...verts]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) return;
    finishStroke();
  }, [finishStroke]);

  const handlePointerLeave = useCallback(() => {
    useUIStore.getState().setHover(null, null);
  }, []);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!(e.object instanceof THREE.InstancedMesh) || !e.face) return;
    e.stopPropagation();
    const point = e.point;
    const inside = point.clone().sub(e.face.normal.clone().multiplyScalar(0.001));
    const target: [number, number, number] = [Math.round(inside.x), Math.round(inside.y), Math.round(inside.z)];
    if (!inBounds(...target)) return;
    useEffectsStore.getState().setFocus(target);
  }, []);

  const showLayerGuide = layersPanelOpen || soloLayerId !== undefined || activeLayer > 0;
  const layerPlaneY = activeLayer + FLOOR_Y;

  return (
    <group
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.nativeEvent.preventDefault()}
    >
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, FLOOR_Y, 0]}
        geometry={planeGeom}
        material={planeMat}
      />
      {children}
      {activeLayer > 0 && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, layerPlaneY, 0]}
          geometry={planeGeom}
          material={planeMat}
        />
      )}
      {showLayerGuide && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, layerPlaneY, 0]}
          geometry={planeGeom}
          material={guideMat}
          raycast={() => null}
        />
      )}
    </group>
  );
}
