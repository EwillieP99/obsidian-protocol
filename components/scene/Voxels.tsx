'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useVoxelStore } from '@/stores/voxelStore';
import type { BlockId } from '@/types';
import { BLOCK_TYPES, BLOCK_ORDER } from '@/lib/blocks';
import { unkey } from '@/lib/utils';
import { WORLD_HEIGHT, WORLD_SIZE } from '@/lib/constants';
import {
  PULSE_CORE_VERTEX,
  PULSE_CORE_FRAGMENT,
  HOLO_FRAGMENT,
  DATA_WATERFALL_FRAGMENT,
  GLITCH_FRAGMENT,
  CIRCUIT_FRAGMENT,
} from '@/shaders';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/**
 * One uniform object shared by all shader-driven block types so a single useFrame
 * call updates `uTime` for the whole scene instead of paying per-material/per-frame.
 */
const SHARED_UNIFORMS = {
  uTime: { value: 0 },
};

function buildShaderMaterial(blockId: BlockId): THREE.ShaderMaterial {
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
      uTime: SHARED_UNIFORMS.uTime, // shared!
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
    vertexColors: true, // we encode per-cell opacity via instanceColor
  });
}

interface InstancedGroupProps {
  blockId: BlockId;
}

function InstancedGroup({ blockId }: InstancedGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const block = BLOCK_TYPES[blockId];
  const cells = useVoxelStore((s) => s.cells);
  const revision = useVoxelStore((s) => s.revision);
  const layerRevision = useVoxelStore((s) => s.layerRevision);
  const [capacity, setCapacity] = useState(256);

  const material = useMemo(() => {
    return block.shader ? buildShaderMaterial(blockId) : buildStandardMaterial(blockId);
  }, [blockId, block.shader]);

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    // Override the box's tight bounding sphere with one that encloses the
    // entire world so frustum culling works correctly for instanced cells
    // placed anywhere in the grid (otherwise three.js culls based on the
    // single-cell sphere centered on origin and far-away cells disappear).
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, WORLD_HEIGHT / 2, 0),
      Math.sqrt(WORLD_SIZE * WORLD_SIZE * 0.5 + WORLD_HEIGHT * WORLD_HEIGHT * 0.25) + 2,
    );
    return g;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Compute positions sync with store changes. Layer visibility/opacity changes also re-run.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const store = useVoxelStore.getState();
    const layers = store.layers;
    // Pre-build a per-y opacity / visibility lookup for O(1) checks.
    const visByY = new Array<boolean>(WORLD_HEIGHT).fill(false);
    const opByY = new Array<number>(WORLD_HEIGHT).fill(1);
    const solo = layers.find((l) => l.solo);
    for (let i = 0; i < WORLD_HEIGHT; i++) {
      const l = layers.find((ll) => ll.id === i);
      if (!l) continue;
      visByY[i] = solo ? solo.id === i : l.visible;
      opByY[i] = l.opacity ?? 1;
    }

    // Walk cells.
    let count = 0;
    const positions: Array<[number, number, number, number]> = []; // [x,y,z,opacity]
    for (const [k, id] of cells.entries()) {
      if (id !== blockId) continue;
      const [x, y, z] = unkey(k);
      if (!visByY[y]) continue;
      const op = opByY[y];
      positions.push([x, y, z, op]);
      count++;
    }

    if (count > capacity) {
      // Grow capacity — triggers re-mount of the InstancedMesh with a bigger buffer.
      setCapacity(Math.ceil(count * 1.5));
      return;
    }

    mesh.count = count;
    for (let i = 0; i < count; i++) {
      const [x, y, z, op] = positions[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Encode per-cell opacity into the instance color's alpha-equivalent: we
      // use color.r as a multiplier in the standard material via vertexColors,
      // but MeshStandardMaterial.vertexColors multiplies the base color. To
      // keep per-block tint correct, we instead modulate brightness — fully
      // opaque = color (1,1,1); 50% layer opacity = color (0.5,0.5,0.5).
      // The result is dimming proportional to per-layer opacity, which is the
      // intended visual effect (and avoids needing alpha blending state changes).
      const v = block.shader ? 1 : op;
      tmpColor.setRGB(v, v, v);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.visible = count > 0;
  }, [cells, revision, layerRevision, blockId, capacity, block.shader]);

  // Note: shader uTime is updated centrally by <SharedShaderClock>. Per-instance
  // animation here is a no-op.

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      frustumCulled
      castShadow={false}
      receiveShadow={false}
      userData={{ blockId }}
    />
  );
}

/**
 * One frame loop drives the shared `uTime` uniform for every shader-driven
 * block type. Saves N-1 useFrame subscriptions and matches what was previously
 * happening per-InstancedGroup.
 */
function SharedShaderClock() {
  useFrame((state) => {
    SHARED_UNIFORMS.uTime.value = state.clock.elapsedTime;
  });
  return null;
}

export function Voxels() {
  return (
    <group>
      <SharedShaderClock />
      {BLOCK_ORDER.map((id) => (
        <InstancedGroup key={id} blockId={id} />
      ))}
    </group>
  );
}
