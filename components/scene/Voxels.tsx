'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getEngine } from '@/hooks/useEngine';
import { RenderBridge, type SharedUniforms } from '@/engine/bridge/RenderBridge';

// Shared uTime uniform — module-level so hot reloads don't break the reference
// already held inside ShaderMaterial uniforms.
const sharedUniforms: SharedUniforms = { uTime: { value: 0 } };

export function Voxels() {
  const bridgeRef = useRef<RenderBridge | null>(null);

  // Lazy-init inside render so the constructor runs client-side only (Three.js).
  if (bridgeRef.current === null) {
    bridgeRef.current = new RenderBridge(sharedUniforms);
  }
  const bridge = bridgeRef.current;

  useEffect(() => {
    const eng = getEngine();

    // Seed with any cells that are already in the engine (hot-reload, re-mount).
    bridge.setLayers(eng.getLayers());
    const initial = eng.getAllCells();
    if (initial.length > 0) bridge.queueDeltas(initial);

    const unsubPatch = eng.on('patch', (ev) => {
      if (ev.clearBeforeApply) bridge.clearAllCells();
      bridge.queueDeltas(ev.deltas);
    });

    const unsubLayers = eng.on('layers', (ev) => {
      bridge.setLayers(ev.layers);
    });

    return () => {
      unsubPatch();
      unsubLayers();
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [bridge]);

  useFrame((state) => {
    sharedUniforms.uTime.value = state.clock.elapsedTime;
    bridge.flushPending();
  });

  return (
    <group>
      {bridge.renderableMeshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
}
