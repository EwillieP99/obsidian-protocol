'use client';

import { useUIStore } from '@/stores/uiStore';

/**
 * Subtle background "data stream" effect rendered under the HUD when the
 * scene is active. Pure CSS animation — does not affect FPS.
 */
export function HudStream() {
  const booted = useUIStore((s) => s.booted);
  if (!booted) return null;
  return <div className="hud-stream" aria-hidden />;
}
