'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffectsStore } from '@/stores/effectsStore';

/**
 * Renders particle bursts, applies camera shake, and overlays cell-flash highlights.
 * Lives inside the <Canvas> tree.
 *
 * Particles are rendered as a single InstancedMesh (octahedron) — colored per-instance
 * via setColorAt. Cap is bounded by the effects store so worst-case work per frame is
 * stable even on a heavy session.
 */

const PARTICLE_CAP = 360;
const FLASH_CAP = 96;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export function SceneEffects() {
  const camera = useThree((s) => s.camera);
  const tick = useEffectsStore((s) => s.tick);

  const particleMeshRef = useRef<THREE.InstancedMesh>(null);
  const flashMeshRef = useRef<THREE.InstancedMesh>(null);

  // Geometries reused across frames.
  const particleGeom = useMemo(() => new THREE.OctahedronGeometry(0.5, 0), []);
  const particleMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexColors: false,
  }), []);

  const flashGeom = useMemo(() => new THREE.BoxGeometry(1.06, 1.06, 1.06), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => {
    return () => {
      particleGeom.dispose();
      particleMat.dispose();
      flashGeom.dispose();
      flashMat.dispose();
    };
  }, [particleGeom, particleMat, flashGeom, flashMat]);

  // Camera shake — store last camera position offset and reapply each frame.
  const baseOffset = useMemo(() => new THREE.Vector3(), []);
  const lastShakeOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_state, dt) => {
    // Advance the simulation
    tick(Math.min(0.05, dt)); // clamp dt during long frames

    const s = useEffectsStore.getState();

    // ----- Particles -----
    const pmesh = particleMeshRef.current;
    if (pmesh) {
      const n = Math.min(s.particles.length, PARTICLE_CAP);
      pmesh.count = n;
      for (let i = 0; i < n; i++) {
        const p = s.particles[i];
        const t = p.life / p.maxLife;
        const sz = p.size * (0.4 + t * 0.6);
        dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
        dummy.rotation.set(t * 4, t * 6, t * 3);
        dummy.scale.setScalar(sz);
        dummy.updateMatrix();
        pmesh.setMatrixAt(i, dummy.matrix);
        tmpColor.set(p.color);
        // Brighter near birth — gives the spark a "hot" core to bloom out
        const boost = 1 + (1 - t) * 1.6;
        tmpColor.multiplyScalar(boost);
        pmesh.setColorAt(i, tmpColor);
      }
      pmesh.instanceMatrix.needsUpdate = true;
      if (pmesh.instanceColor) pmesh.instanceColor.needsUpdate = true;
      pmesh.visible = n > 0;
    }

    // ----- Cell flash (undo/redo highlight) -----
    const fmesh = flashMeshRef.current;
    if (fmesh) {
      const flash = s.flashCells;
      if (!flash) {
        fmesh.count = 0;
        fmesh.visible = false;
      } else {
        const n = Math.min(flash.keys.length, FLASH_CAP);
        const lifeT = flash.life / flash.maxLife;
        const op = Math.max(0, lifeT) * 0.55;
        flashMat.opacity = op;
        fmesh.count = n;
        const c = tmpColor.set(flash.color);
        for (let i = 0; i < n; i++) {
          const [xs, ys, zs] = flash.keys[i].split(',');
          const x = parseInt(xs, 10);
          const y = parseInt(ys, 10);
          const z = parseInt(zs, 10);
          const pulse = 1 + (1 - lifeT) * 0.4;
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(pulse);
          dummy.updateMatrix();
          fmesh.setMatrixAt(i, dummy.matrix);
          fmesh.setColorAt(i, c);
        }
        fmesh.instanceMatrix.needsUpdate = true;
        if (fmesh.instanceColor) fmesh.instanceColor.needsUpdate = true;
        fmesh.visible = n > 0;
      }
    }

    // ----- Camera shake -----
    if (s.shake > 0.0005) {
      // Undo last frame's shake offset before adding this frame's
      camera.position.sub(lastShakeOffset);
      const m = s.shake * 0.18; // small enough to feel kinetic without nausea
      lastShakeOffset.set(
        (Math.random() - 0.5) * m,
        (Math.random() - 0.5) * m,
        (Math.random() - 0.5) * m,
      );
      camera.position.add(lastShakeOffset);
    } else if (lastShakeOffset.lengthSq() > 0) {
      camera.position.sub(lastShakeOffset);
      lastShakeOffset.set(0, 0, 0);
    }
    baseOffset.set(0, 0, 0); // unused for now; reserved for future smoothed shake
  });

  return (
    <group>
      <instancedMesh
        ref={particleMeshRef}
        args={[particleGeom, particleMat, PARTICLE_CAP]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={flashMeshRef}
        args={[flashGeom, flashMat, FLASH_CAP]}
        frustumCulled={false}
        renderOrder={950}
      />
    </group>
  );
}
