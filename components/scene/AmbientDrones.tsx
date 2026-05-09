'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '@/stores/uiStore';
import { WORLD_SIZE, WORLD_HEIGHT } from '@/lib/constants';

/**
 * Background "data drones" — small glowing sprites that drift across the vault
 * along procedural paths. Pure visual flavor; no interaction.
 *
 * Quality preset multipliers reduce drone count at lower presets so the GPU
 * keeps room for the user's actual structure.
 */
const QUALITY_MUL: Record<'high' | 'balanced' | 'performance', number> = {
  high: 1,
  balanced: 0.6,
  performance: 0.25,
};

export function AmbientDrones() {
  const count = useUIStore((s) => s.scene.ambientDrones);
  const quality = useUIStore((s) => s.scene.quality);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const seeds = useMemo(() => {
    return Array.from({ length: 64 }, (_, i) => ({
      offset: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.6,
      radius: 6 + Math.random() * (WORLD_SIZE / 2 - 4),
      height: 1 + Math.random() * (WORLD_HEIGHT - 2),
      phase: i * 0.97,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorsArr = useMemo(() => {
    const arr = new Float32Array(64 * 3);
    for (let i = 0; i < 64; i++) {
      const c = new THREE.Color().setHSL(Math.random() * 0.18 + 0.45, 1, 0.6);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, []);

  // Reuse one Color object — avoid allocating per-frame.
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const target = Math.max(0, Math.min(64, count));
    const n = Math.floor(target * QUALITY_MUL[quality]);
    mesh.count = n;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      const angle = t * s.speed + s.offset;
      const x = Math.cos(angle) * s.radius;
      const z = Math.sin(angle * 0.8) * s.radius;
      const y = s.height + Math.sin(t * 1.2 + s.phase) * 0.6;
      dummy.position.set(x, y, z);
      const pulse = 0.18 + 0.18 * Math.sin(t * 4 + s.phase);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmp.setRGB(colorsArr[i * 3], colorsArr[i * 3 + 1], colorsArr[i * 3 + 2]);
      mesh.setColorAt(i, tmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 64]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
