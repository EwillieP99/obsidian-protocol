'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import type { IVoxelEngine, EngineStats, LayerMeta, ChronoEntry } from '@/types/engine';
import type { Contract } from '@/types';
import { useUIStore } from '@/stores/uiStore';

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

/** Subscribe to engine errors and degraded worker state for user-visible feedback. */
export function useEngineErrorHandler(): void {
  useEffect(() => {
    const engine = getVoxelEngine();
    const syncDegraded = () => {
      useUIStore.getState().setEngineDegraded(engine.isDegraded());
    };

    syncDegraded();
    const offReady = engine.on('ready', syncDegraded);
    const offError = engine.on('error', (e) => {
      toast.error(e.message, { duration: 6000 });
      syncDegraded();
    });

    const poll = window.setInterval(syncDegraded, 2000);
    return () => {
      offReady();
      offError();
      window.clearInterval(poll);
    };
  }, []);
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

/**
 * Returns the top-4 block IDs by count per layer, recomputed on every patch.
 * Used for visual block-type swatches in the layer panel.
 */
export function useLayerDominantBlocks(): Map<number, string[]> {
  const compute = (): Map<number, string[]> => {
    const byLayer = new Map<number, Map<string, number>>();
    for (const d of getEngine().getAllCells()) {
      if (!d.newBlockId) continue;
      let m = byLayer.get(d.layer);
      if (!m) { m = new Map(); byLayer.set(d.layer, m); }
      m.set(d.newBlockId, (m.get(d.newBlockId) ?? 0) + 1);
    }
    const result = new Map<number, string[]>();
    for (const [layerId, typeCounts] of byLayer) {
      const sorted = [...typeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => id);
      result.set(layerId, sorted);
    }
    return result;
  };

  const [data, setData] = useState<Map<number, string[]>>(compute);
  useEffect(() => getEngine().on('patch', () => setData(compute())), []);
  return data;
}
