'use client';

import * as THREE from 'three';
import { useMemo } from 'react';
import { WORLD_SIZE, FLOOR_Y } from '@/lib/constants';

export function GridFloor() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE, 0x00f9ff, 0x0a2230);
    (g.material as THREE.Material & { transparent: boolean; opacity: number }).transparent = true;
    (g.material as THREE.Material & { opacity: number }).opacity = 0.35;
    g.position.y = FLOOR_Y;
    return g;
  }, []);

  return (
    <group>
      <primitive object={grid} />
      {/* Subtle dark plate beneath the grid */}
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y - 0.02, 0]} receiveShadow>
        <planeGeometry args={[WORLD_SIZE * 1.6, WORLD_SIZE * 1.6]} />
        <meshStandardMaterial color="#03050a" metalness={0.3} roughness={0.85} />
      </mesh>
    </group>
  );
}
