'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useUIStore } from '@/stores/uiStore';
import { useEffectsStore } from '@/stores/effectsStore';
import { CAMERA_PRESETS } from '@/lib/constants';

/**
 * Cinematic camera. Three sources of motion:
 *   1. Camera preset switch (architect/street/neural-dive) — slow ease.
 *   2. Focus-on-Selection target from the effects store — snappier ease that
 *      orbits toward the selection while keeping a comfortable look distance.
 *   3. OrbitControls user input (dragging/zoom).
 *
 * Tweens use cubic ease-out and a separate startPos/startTarget capture so
 * the curve is stable even if frame deltas fluctuate.
 */
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const preset = useUIStore((s) => s.cameraPreset);
  const cinematic = useUIStore((s) => s.scene.cinematic);
  const controlsRef = useRef<any>(null);

  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const lerpProgress = useRef(0); // 0..1, 1 = arrived
  const lerpDuration = useRef(1.4);

  function beginTween(toPos: THREE.Vector3, toLook: THREE.Vector3, duration: number) {
    startPos.current.copy(camera.position);
    if (controlsRef.current?.target) startLook.current.copy(controlsRef.current.target);
    else startLook.current.set(0, 4, 0);
    targetPos.current.copy(toPos);
    targetLook.current.copy(toLook);
    lerpProgress.current = 0;
    lerpDuration.current = duration;
  }

  useEffect(() => {
    const p = CAMERA_PRESETS[preset];
    if ((camera as THREE.PerspectiveCamera).fov !== p.fov) {
      (camera as THREE.PerspectiveCamera).fov = p.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
    beginTween(
      new THREE.Vector3().fromArray(p.position),
      new THREE.Vector3().fromArray(p.target),
      1.4,
    );
  }, [preset, camera]);

  useEffect(() => {
    const unsub = useEffectsStore.subscribe((state, prev) => {
      if (state.focusTarget === prev.focusTarget || !state.focusTarget) return;
      const f = state.focusTarget;
      const focusVec = new THREE.Vector3(f[0], f[1], f[2]);
      const cur = controlsRef.current?.target ? (controlsRef.current.target as THREE.Vector3).clone() : new THREE.Vector3();
      const dirFromTarget = camera.position.clone().sub(cur);
      const dist = THREE.MathUtils.clamp(dirFromTarget.length(), 12, 36);
      dirFromTarget.normalize().multiplyScalar(dist);
      const toPos = focusVec.clone().add(dirFromTarget);
      beginTween(toPos, focusVec, 0.9);
    });
    return () => unsub();
  }, [camera]);

  useFrame((_state, delta) => {
    if (lerpProgress.current < 1) {
      lerpProgress.current = Math.min(1, lerpProgress.current + delta / lerpDuration.current);
      const t = easeOutCubic(lerpProgress.current);
      camera.position.lerpVectors(startPos.current, targetPos.current, t);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startLook.current, targetLook.current, t);
        controlsRef.current.update();
      }
      if (lerpProgress.current >= 1) {
        camera.position.copy(targetPos.current);
        if (controlsRef.current) {
          controlsRef.current.target.copy(targetLook.current);
          controlsRef.current.update();
        }
      }
    }

    if (cinematic && controlsRef.current && lerpProgress.current >= 1) {
      controlsRef.current.autoRotate = true;
      controlsRef.current.autoRotateSpeed = 0.6;
      controlsRef.current.update();
    } else if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={3}
      maxDistance={120}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={CAMERA_PRESETS.architect.target}
    />
  );
}
