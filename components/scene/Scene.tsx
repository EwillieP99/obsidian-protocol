'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { Voxels } from './Voxels';
import { GridFloor } from './GridFloor';
import { Cursor } from './Cursor';
import { Interaction } from './Interaction';
import { CameraRig } from './CameraRig';
import { PostFX } from './PostFX';
import { AmbientDrones } from './AmbientDrones';
import { FpsTracker } from './FpsTracker';
import { SceneEffects } from './SceneEffects';
import { CAMERA_PRESETS } from '@/lib/constants';

export function Scene({ onCanvasReady }: { onCanvasReady?: (gl: THREE.WebGLRenderer) => void }) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      camera={{
        position: CAMERA_PRESETS.architect.position,
        fov: CAMERA_PRESETS.architect.fov,
        near: 0.1,
        far: 500,
      }}
      onCreated={({ gl, scene }) => {
        scene.background = new THREE.Color('#03050a');
        scene.fog = new THREE.FogExp2('#020308', 0.012);
        onCanvasReady?.(gl);
      }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.18} color={'#1a1f30'} />
        <hemisphereLight args={['#0099ff', '#000820', 0.25]} />
        <directionalLight
          position={[20, 40, 12]}
          intensity={0.5}
          color={'#9aa3ff'}
        />
        {/* Magenta rim light */}
        <pointLight position={[-22, 14, -12]} intensity={1.2} color={'#ff00aa'} distance={70} decay={1.6} />
        {/* Cyan accent */}
        <pointLight position={[24, 6, 18]} intensity={0.9} color={'#00f9ff'} distance={60} decay={1.6} />

        <CameraRig />
        <GridFloor />
        <Interaction>
          <Voxels />
        </Interaction>
        <Cursor />
        <SceneEffects />
        <AmbientDrones />
        <PostFX />
        <FpsTracker />
      </Suspense>
    </Canvas>
  );
}
