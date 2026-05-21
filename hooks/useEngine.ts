'use client';

import { useEffect, useState } from 'react';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import type { IVoxelEngine, EngineStats, LayerMeta, ChronoEntry } from '@/types/engine';
import type { Contract } from '@/types';

export function useEngine(): { engine: IVoxelEngine; ready: boolean } {
  const engine = getVoxelEngine();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void engine.init().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [engine]);

  return { engine, ready };
}

export function getEngine(): IVoxelEngine {
  return getVoxelEngine();
}

// ---------------------------------------------------------------------------
// Reactive hooks — subscribe to engine events and return cached state
// ---------------------------------------------------------------------------

export function useEngineStats(): EngineStats {
  const [stats, setStats] = useState<EngineStats>(() => getEngine().getStats());
  useEffect(() => {
    setStats(getEngine().getStats());
    return getEngine().on('stats', (e) => setStats(e.stats));
  }, []);
  return stats;
}

export function useEngineLayers(): { layers: LayerMeta[]; activeLayer: number } {
  const [layers, setLayers] = useState<LayerMeta[]>(() => getEngine().getLayers());
  const [activeLayer, setActiveLayer] = useState<number>(() => getEngine().getActiveLayer());
  useEffect(() => {
    setLayers(getEngine().getLayers());
    setActiveLayer(getEngine().getActiveLayer());
    return getEngine().on('layers', (e) => {
      setLayers(e.layers);
      setActiveLayer(e.activeLayer);
    });
  }, []);
  return { layers, activeLayer };
}

export function useEngineChrono(): { entries: ChronoEntry[]; futureEntries: ChronoEntry[] } {
  const [entries, setEntries] = useState<ChronoEntry[]>(() => getEngine().getChronoEntries());
  const [futureEntries, setFutureEntries] = useState<ChronoEntry[]>(() => getEngine().getChronoFuture());
  useEffect(() => {
    setEntries(getEngine().getChronoEntries());
    setFutureEntries(getEngine().getChronoFuture());
    return getEngine().on('chrono', (e) => {
      setEntries(e.entries);
      setFutureEntries(e.futureEntries);
    });
  }, []);
  return { entries, futureEntries };
}

export function useEngineContract(): Contract | null {
  const [contract, setContract] = useState<Contract | null>(() => getEngine().getContract());
  useEffect(() => {
    setContract(getEngine().getContract());
    return getEngine().on('contract', (e) => setContract(e.contract));
  }, []);
  return contract;
}

/**
 * Tracks per-layer block counts. Starts from current cells and updates
 * incrementally on every 'patch' event.
 */
export function useLayerCounts(): Map<number, number> {
  const [counts, setCounts] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const d of getEngine().getAllCells()) {
      if (d.newBlockId !== null) m.set(d.layer, (m.get(d.layer) ?? 0) + 1);
    }
    return m;
  });

  useEffect(() => {
    return getEngine().on('patch', (e) => {
      if (e.clearBeforeApply) {
        const m = new Map<number, number>();
        for (const d of e.deltas) {
          if (d.newBlockId !== null) m.set(d.layer, (m.get(d.layer) ?? 0) + 1);
        }
        setCounts(m);
      } else {
        setCounts((prev) => {
          const next = new Map(prev);
          for (const d of e.deltas) {
            if (d.prevBlockId !== null && d.newBlockId === null) {
              const cur = next.get(d.layer) ?? 0;
              if (cur <= 1) next.delete(d.layer);
              else next.set(d.layer, cur - 1);
            } else if (d.prevBlockId === null && d.newBlockId !== null) {
              next.set(d.layer, (next.get(d.layer) ?? 0) + 1);
            }
          }
          return next;
        });
      }
    });
  }, []);

  return counts;
}
