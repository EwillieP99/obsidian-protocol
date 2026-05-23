// RenderBridge — owns the GPU-side voxel rendering state.
//
// Phase 3 promotes the worker to source of truth for cell data. The
// VoxelEngine receives PATCH events and forwards the deltas here. We hold
// pre-allocated InstancedMesh objects (one per opaque block type plus one
// transparent slot for data-stream) sized at MAX_INSTANCES, and apply
// incoming deltas in a single per-frame flush — eliminating the V1
// useEffect([revision]) full-rebuild thrash.
//
// Black-box rule: this module imports Three.js and our pure helpers but
// NOT React, R3F, or Zustand. R3F renders the meshes via `<primitive />`
// after Voxels.tsx grabs `bridge.renderableMeshes`.

import * as THREE from 'three';
import {
  BLOCK_INDEX_TABLE,
  BLOCK_TYPES,
  blockIdToIndex,
} from '@/lib/blocks';
import { MAX_INSTANCES, WORLD_HEIGHT, WORLD_SIZE } from '@/lib/constants';
import type { BlockId } from '@/types';
import type { CellDelta, LayerMeta } from '@/types/engine';
import {
  CIRCUIT_FRAGMENT,
  DATA_WATERFALL_FRAGMENT,
  GLITCH_FRAGMENT,
  HOLO_FRAGMENT,
  PULSE_CORE_FRAGMENT,
  PULSE_CORE_VERTEX,
} from '@/shaders';

// ---------------------------------------------------------------------------
// SlotAllocator — maps stable cell identity (cellLinearIdx) to the per-mesh
// instance slot. Pure data structure; one allocator per mesh.
// ---------------------------------------------------------------------------

export class SlotAllocator {
  private slotMap = new Map<number, number>();
  private freeList: number[] = [];
  /** Highest slot index ever allocated (i.e. mesh.count == nextSlot). */
  private nextSlot = 0;

  alloc(cellIdx: number): number {
    const existing = this.slotMap.get(cellIdx);
    if (existing !== undefined) return existing;
    let slot: number;
    if (this.freeList.length > 0) {
      slot = this.freeList.pop()!;
    } else {
      if (this.nextSlot >= MAX_INSTANCES) return -1;
      slot = this.nextSlot++;
    }
    this.slotMap.set(cellIdx, slot);
    return slot;
  }

  free(cellIdx: number): number | undefined {
    const slot = this.slotMap.get(cellIdx);
    if (slot === undefined) return undefined;
    this.slotMap.delete(cellIdx);
    this.freeList.push(slot);
    return slot;
  }

  get(cellIdx: number): number | undefined {
    return this.slotMap.get(cellIdx);
  }

  /** Effective rendered range — mesh.count uses this. */
  highWatermark(): number {
    return this.nextSlot;
  }

  clear(): void {
    this.slotMap.clear();
    this.freeList.length = 0;
    this.nextSlot = 0;
  }
}

// ---------------------------------------------------------------------------
// Per-cell metadata kept on the main thread so the bridge can re-bake without
// asking the worker. Sized roughly 40 bytes per cell — at 16k cells that's
// 640 KB, negligible compared to the InstancedMatrix buffers.
// ---------------------------------------------------------------------------

interface CellRecord {
  x: number;
  y: number;
  z: number;
  blockIndex: number; // 1..255 (0 = air = no record)
  layerId: number;
  opacityBaked: number; // last opacity written to instanceColor
}

// ---------------------------------------------------------------------------
// Shared scratch objects — module-level so we don't allocate per-delta.
// ---------------------------------------------------------------------------

const dummyObject = new THREE.Object3D();
const tmpColor = new THREE.Color();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

// World-bounds bounding sphere (cached). All meshes share this so frustum
// culling doesn't reject far-from-origin cells.
const WORLD_BOUNDING_SPHERE = new THREE.Sphere(
  new THREE.Vector3(0, WORLD_HEIGHT / 2, 0),
  Math.sqrt(WORLD_SIZE * WORLD_SIZE * 0.5 + WORLD_HEIGHT * WORLD_HEIGHT * 0.25) + 2,
);

function buildSharedGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.boundingSphere = WORLD_BOUNDING_SPHERE.clone();
  return g;
}

function buildShaderMaterial(
  blockId: BlockId,
  sharedUniforms: { uTime: { value: number } },
): THREE.ShaderMaterial {
  const b = BLOCK_TYPES[blockId];
  const fragMap: Record<string, string> = {
    'pulse-core': PULSE_CORE_FRAGMENT,
    holo: HOLO_FRAGMENT,
    'data-waterfall': DATA_WATERFALL_FRAGMENT,
    glitch: GLITCH_FRAGMENT,
    circuit: CIRCUIT_FRAGMENT,
  };
  const frag = fragMap[b.shader ?? ''];
  return new THREE.ShaderMaterial({
    vertexShader: PULSE_CORE_VERTEX,
    fragmentShader: frag,
    uniforms: {
      uTime: sharedUniforms.uTime, // shared!
      uColor: { value: new THREE.Color(b.color) },
      uEmissive: { value: new THREE.Color(b.emissive).multiplyScalar(b.emissiveIntensity * 0.5) },
    },
    transparent: !!b.transparent,
    depthWrite: !b.transparent,
  });
}

function buildStandardMaterial(blockId: BlockId): THREE.MeshStandardMaterial {
  const b = BLOCK_TYPES[blockId];
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(b.color),
    emissive: new THREE.Color(b.emissive),
    emissiveIntensity: b.emissiveIntensity,
    metalness: b.metalness,
    roughness: b.roughness,
    transparent: !!b.transparent,
    opacity: b.opacity ?? 1,
    depthWrite: !b.transparent,
    vertexColors: true, // per-cell grayscale opacity bake
  });
}

// ---------------------------------------------------------------------------
// RenderBridge
// ---------------------------------------------------------------------------

export interface SharedUniforms {
  uTime: { value: number };
}

export class RenderBridge {
  /** All renderable meshes in BLOCK_INDEX_TABLE order (excluding air). */
  readonly renderableMeshes: THREE.InstancedMesh[];

  // Indexed by BlockIndex (1..N). Index 0 is unused (air).
  private readonly meshByIndex: Array<THREE.InstancedMesh | null>;
  private readonly allocatorByIndex: Array<SlotAllocator | null>;

  /** cellIdx -> per-cell metadata. Authoritative for re-bake operations. */
  private readonly cellMeta = new Map<number, CellRecord>();

  /** layerId -> set of cellIdx in that layer. Built incrementally on PATCH. */
  private readonly layerCells = new Map<number, Set<number>>();

  /** Most recent layer state (visibility / opacity / solo / lock). */
  private layers: LayerMeta[] = [];

  // Queued deltas to apply on next flushPending().
  private readonly pendingDeltas: CellDelta[] = [];

  // Per-flush dirty sets.
  private readonly dirtyMatrix = new Set<number>();
  private readonly dirtyColor = new Set<number>();

  constructor(sharedUniforms: SharedUniforms) {
    this.meshByIndex = [null]; // index 0 = air
    this.allocatorByIndex = [null];
    const renderable: THREE.InstancedMesh[] = [];

    for (let i = 1; i < BLOCK_INDEX_TABLE.length; i++) {
      const blockId = BLOCK_INDEX_TABLE[i];
      if (!blockId) {
        this.meshByIndex[i] = null;
        this.allocatorByIndex[i] = null;
        continue;
      }
      const block = BLOCK_TYPES[blockId];
      const geometry = buildSharedGeometry();
      const material = block.shader
        ? buildShaderMaterial(blockId, sharedUniforms)
        : buildStandardMaterial(blockId);

      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
      mesh.count = 0; // nothing alive yet
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData = { blockId, blockIndex: i };
      if (block.transparent) {
        // Render transparent passes after opaque to avoid z-fighting with
        // depthWrite=false. Single transparent block today (data-stream).
        mesh.renderOrder = 1;
      }

      this.meshByIndex[i] = mesh;
      this.allocatorByIndex[i] = new SlotAllocator();
      renderable.push(mesh);
    }
    this.renderableMeshes = renderable;
  }

  // -----------------------------------------------------------------------
  // Inbound: deltas + layer state
  // -----------------------------------------------------------------------

  /**
   * Queue deltas for the next per-frame flush. Multiple bursts between
   * frames are coalesced into a single GPU upload.
   */
  queueDeltas(deltas: CellDelta[]): void {
    if (deltas.length === 0) return;
    for (const d of deltas) this.pendingDeltas.push(d);
  }

  /**
   * Replace the bridge's layer model. Triggers a re-bake of cells whose
   * effective visibility / opacity changed.
   */
  setLayers(layers: LayerMeta[]): void {
    const prev = this.layers;
    this.layers = layers.map((l) => ({ ...l }));

    const prevSolo = prev.find((l) => l.solo);
    const currSolo = this.layers.find((l) => l.solo);
    const soloChanged = (prevSolo?.id ?? -1) !== (currSolo?.id ?? -1);

    const affected = new Set<number>();
    if (soloChanged) {
      // Solo changes the effective visibility of every layer.
      for (const l of this.layers) affected.add(l.id);
    } else {
      const prevById = new Map(prev.map((l) => [l.id, l]));
      for (const l of this.layers) {
        const p = prevById.get(l.id);
        if (!p) {
          affected.add(l.id);
          continue;
        }
        const prevOp = p.opacity ?? 1;
        const currOp = l.opacity ?? 1;
        if (p.visible !== l.visible || prevOp !== currOp) {
          affected.add(l.id);
        }
      }
    }

    for (const layerId of affected) {
      this.rebakeLayer(layerId);
    }
  }

  /**
   * Drop every cell from every mesh. Used on engine.clearAll() or before
   * a loadSave() bulk-import. Does not touch layer state.
   */
  clearAllCells(): void {
    for (let i = 1; i < this.meshByIndex.length; i++) {
      const mesh = this.meshByIndex[i];
      const allocator = this.allocatorByIndex[i];
      if (!mesh || !allocator) continue;
      // Reset every potentially-rendered slot. Costs O(highWatermark), not
      // O(MAX_INSTANCES). Cheaper than re-creating the mesh.
      const wm = allocator.highWatermark();
      for (let s = 0; s < wm; s++) {
        mesh.setMatrixAt(s, ZERO_MATRIX);
      }
      allocator.clear();
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.cellMeta.clear();
    this.layerCells.clear();
    this.pendingDeltas.length = 0;
    this.dirtyMatrix.clear();
    this.dirtyColor.clear();
  }

  // -----------------------------------------------------------------------
  // Per-frame flush — called from Voxels.tsx useFrame.
  // -----------------------------------------------------------------------

  flushPending(): void {
    if (this.pendingDeltas.length === 0 && this.dirtyMatrix.size === 0 && this.dirtyColor.size === 0) {
      return;
    }

    for (let i = 0; i < this.pendingDeltas.length; i++) {
      const d = this.pendingDeltas[i];
      const newBlockIdx = d.newBlockId === null ? 0 : blockIdToIndex(d.newBlockId);
      const prevBlockIdx = d.prevBlockId === null ? 0 : blockIdToIndex(d.prevBlockId);

      // Free the old slot first (handles place-over-existing too).
      if (prevBlockIdx !== 0) {
        const prevMesh = this.meshByIndex[prevBlockIdx];
        const prevAlloc = this.allocatorByIndex[prevBlockIdx];
        if (prevMesh && prevAlloc) {
          const slot = prevAlloc.free(d.cellIdx);
          if (slot !== undefined) {
            prevMesh.setMatrixAt(slot, ZERO_MATRIX);
            this.dirtyMatrix.add(prevBlockIdx);
          }
        }
        // Forget the previous cell record (will be replaced if we place over).
        this.removeFromLayerIndex(d.cellIdx);
        this.cellMeta.delete(d.cellIdx);
      }

      // Allocate + write the new cell.
      if (newBlockIdx !== 0) {
        const mesh = this.meshByIndex[newBlockIdx];
        const allocator = this.allocatorByIndex[newBlockIdx];
        if (mesh && allocator) {
          const slot = allocator.alloc(d.cellIdx);
          if (slot < 0) {
            // eslint-disable-next-line no-console
            console.error('[RenderBridge] MAX_INSTANCES exceeded for block index', newBlockIdx);
            continue;
          }
          dummyObject.position.set(d.x, d.y, d.z);
          dummyObject.rotation.set(0, 0, 0);
          dummyObject.scale.setScalar(1);
          dummyObject.updateMatrix();
          mesh.setMatrixAt(slot, dummyObject.matrix);

          const blockId = BLOCK_INDEX_TABLE[newBlockIdx]!;
          const isShader = !!BLOCK_TYPES[blockId].shader;
          const baked = this.effectiveOpacityForCell(d.layer, d.opacity);
          const v = isShader ? 1 : baked;
          tmpColor.setRGB(v, v, v);
          mesh.setColorAt(slot, tmpColor);

          this.dirtyMatrix.add(newBlockIdx);
          this.dirtyColor.add(newBlockIdx);

          // Track metadata for re-bake on layer change.
          this.cellMeta.set(d.cellIdx, {
            x: d.x,
            y: d.y,
            z: d.z,
            blockIndex: newBlockIdx,
            layerId: d.layer,
            opacityBaked: baked,
          });
          this.addToLayerIndex(d.layer, d.cellIdx);

          // If the cell's effective state is currently "hidden" via solo or
          // visibility=false, collapse the matrix to zero scale.
          if (!this.layerIsEffectivelyVisible(d.layer)) {
            mesh.setMatrixAt(slot, ZERO_MATRIX);
          }
        }
      }
    }
    this.pendingDeltas.length = 0;

    // Flush dirty meshes.
    for (const idx of this.dirtyMatrix) {
      const mesh = this.meshByIndex[idx];
      const alloc = this.allocatorByIndex[idx];
      if (!mesh || !alloc) continue;
      mesh.count = alloc.highWatermark();
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const idx of this.dirtyColor) {
      const mesh = this.meshByIndex[idx];
      if (!mesh) continue;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.dirtyMatrix.clear();
    this.dirtyColor.clear();
  }

  // -----------------------------------------------------------------------
  // Internals: layer indexing + re-bake
  // -----------------------------------------------------------------------

  private addToLayerIndex(layerId: number, cellIdx: number): void {
    let set = this.layerCells.get(layerId);
    if (!set) {
      set = new Set();
      this.layerCells.set(layerId, set);
    }
    set.add(cellIdx);
  }

  private removeFromLayerIndex(cellIdx: number): void {
    const record = this.cellMeta.get(cellIdx);
    if (!record) return;
    const set = this.layerCells.get(record.layerId);
    if (set) set.delete(cellIdx);
  }

  private layerIsEffectivelyVisible(layerId: number): boolean {
    const solo = this.layers.find((l) => l.solo);
    if (solo) return solo.id === layerId;
    const layer = this.layers.find((l) => l.id === layerId);
    return layer ? layer.visible : true;
  }

  /**
   * Combine `bakedFromDelta` (block * layer opacity at write time) with the
   * current layer opacity. Layer opacity may have changed since the cell was
   * written, so this re-derives from the layers array.
   */
  private effectiveOpacityForCell(layerId: number, _bakedFromDelta: number): number {
    const layer = this.layers.find((l) => l.id === layerId);
    const layerOp = layer?.opacity ?? 1;
    // Note: we deliberately ignore _bakedFromDelta — the worker emits an
    // opacity baked against ITS view of layer state, but the main-thread
    // bridge holds the most recent layer state from LAYERS events and
    // recomputes from scratch. This avoids stale bakes when a layer opacity
    // changes between PATCH and the next flush.
    void _bakedFromDelta;
    return Math.max(0, Math.min(1, layerOp));
  }

  /**
   * Re-bake every cell in the given layer. Called on layer
   * visibility/opacity/solo changes.
   */
  private rebakeLayer(layerId: number): void {
    const cells = this.layerCells.get(layerId);
    if (!cells || cells.size === 0) return;
    const visible = this.layerIsEffectivelyVisible(layerId);

    for (const cellIdx of cells) {
      const meta = this.cellMeta.get(cellIdx);
      if (!meta) continue;
      const mesh = this.meshByIndex[meta.blockIndex];
      const alloc = this.allocatorByIndex[meta.blockIndex];
      if (!mesh || !alloc) continue;
      const slot = alloc.get(cellIdx);
      if (slot === undefined) continue;

      if (visible) {
        dummyObject.position.set(meta.x, meta.y, meta.z);
        dummyObject.rotation.set(0, 0, 0);
        dummyObject.scale.setScalar(1);
        dummyObject.updateMatrix();
        mesh.setMatrixAt(slot, dummyObject.matrix);

        const blockId = BLOCK_INDEX_TABLE[meta.blockIndex]!;
        const isShader = !!BLOCK_TYPES[blockId].shader;
        const baked = this.effectiveOpacityForCell(layerId, meta.opacityBaked);
        meta.opacityBaked = baked;
        const v = isShader ? 1 : baked;
        tmpColor.setRGB(v, v, v);
        mesh.setColorAt(slot, tmpColor);
        this.dirtyColor.add(meta.blockIndex);
      } else {
        mesh.setMatrixAt(slot, ZERO_MATRIX);
      }
      this.dirtyMatrix.add(meta.blockIndex);
    }
  }

  // -----------------------------------------------------------------------
  // Disposal
  // -----------------------------------------------------------------------

  dispose(): void {
    for (let i = 1; i < this.meshByIndex.length; i++) {
      const mesh = this.meshByIndex[i];
      if (!mesh) continue;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat.dispose();
      }
      mesh.dispose();
    }
    this.cellMeta.clear();
    this.layerCells.clear();
    this.pendingDeltas.length = 0;
    this.dirtyMatrix.clear();
    this.dirtyColor.clear();
  }
}
