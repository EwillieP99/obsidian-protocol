'use client';

import { useEffect, useState } from 'react';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import type { IVoxelEngine } from '@/types/engine';

/**
 * React access point to the VoxelEngine singleton. Calling getEngine() outside
 * a hook is fine — the engine is a plain singleton. This hook adds the React
 * conveniences of "initialized" state and a clean dispose on unmount of the
 * mount-point component.
 *
 * Typical usage in App.tsx:
 *   const { engine, ready } = useEngine();
 *   useEffect(() => engine.on('patch', handlePatch), [engine]);
 */
export function useEngine(): { engine: IVoxelEngine; ready: boolean } {
  const engine = getVoxelEngine();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void engine.init().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  return { engine, ready };
}

/**
 * Sync access for code that runs outside React (e.g. hotkey handlers wired
 * via useEffect — they capture the engine reference once at mount).
 */
export function getEngine(): IVoxelEngine {
  return getVoxelEngine();
}
