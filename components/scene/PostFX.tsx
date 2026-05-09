'use client';

import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise, Glitch } from '@react-three/postprocessing';
import { BlendFunction, KernelSize, GlitchMode } from 'postprocessing';
import { Vector2 } from 'three';
import { useUIStore } from '@/stores/uiStore';
import { useVoxelStore } from '@/stores/voxelStore';
import { useEffectsStore } from '@/stores/effectsStore';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { QualityPreset } from '@/types';

interface QualityProfile {
  bloomKernel: KernelSize;
  vignette: boolean;
  noise: boolean;
  chromatic: boolean;
  bloomMul: number;
}

const QUALITY: Record<QualityPreset, QualityProfile> = {
  high:        { bloomKernel: KernelSize.LARGE,      vignette: true,  noise: true,  chromatic: true,  bloomMul: 1.0 },
  balanced:    { bloomKernel: KernelSize.MEDIUM,     vignette: true,  noise: false, chromatic: true,  bloomMul: 0.8 },
  performance: { bloomKernel: KernelSize.SMALL,      vignette: false, noise: false, chromatic: false, bloomMul: 0.55 },
};

export function PostFX() {
  const settings = useUIStore((s) => s.scene);
  const integrity = useVoxelStore((s) => s.computeIntegrity());

  // Subscribe to bloomFlash via a frame poll to avoid React re-renders.
  // The composer's <Bloom> is keyed off props, so we read the latest each frame.
  const bloomRef = useRef<{ intensity: number }>({ intensity: settings.bloomIntensity });
  const [, force] = useState(0);
  useFrame(() => {
    const f = useEffectsStore.getState().bloomFlash;
    const profile = QUALITY[settings.quality];
    const target = settings.bloomIntensity * profile.bloomMul * (1 + (1 - integrity) * 0.6) * f;
    if (Math.abs(target - bloomRef.current.intensity) > 0.005) {
      bloomRef.current.intensity = target;
      // Re-render at most ~30Hz; bloom intensity changes are smoothed by the composer
      // but the prop reflects via React. Throttle by epsilon above instead of requestAnimationFrame.
      force((n) => (n + 1) % 1024);
    }
  });

  const profile = QUALITY[settings.quality];

  return (
    <EffectComposer multisampling={0} stencilBuffer={false}>
      <Bloom
        intensity={bloomRef.current.intensity}
        kernelSize={profile.bloomKernel}
        luminanceThreshold={0.18}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
      {profile.chromatic ? (
        <ChromaticAberration
          offset={new Vector2(settings.chromaticAberration, settings.chromaticAberration)}
          radialModulation={false}
          modulationOffset={0}
        />
      ) : <></>}
      {profile.vignette && settings.vignette ? <Vignette eskil={false} offset={0.2} darkness={0.85} /> : <></>}
      {profile.noise && settings.scanlines ? <Noise opacity={0.04} blendFunction={BlendFunction.SCREEN} /> : <></>}
      {settings.glitchEffect ? (
        <Glitch
          delay={new Vector2(2.5, 7.5)}
          duration={new Vector2(0.15, 0.4)}
          strength={new Vector2(0.05, 0.25)}
          mode={GlitchMode.SPORADIC}
          active
          ratio={0.85}
        />
      ) : <></>}
    </EffectComposer>
  );
}
