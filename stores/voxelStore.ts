'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BlockId, HistoryEntry, VoxelLayer, Contract, SerializedSave } from '@/types';
import { HISTORY_LIMIT, WORLD_HEIGHT } from '@/lib/constants';
import { key, uid, unkey } from '@/lib/utils';
import { BLOCK_TYPES } from '@/lib/blocks';

interface VoxelState {
  cells: Map<string, BlockId>;
  layers: VoxelLayer[];
  activeLayer: number;
  history: HistoryEntry[];
  future: HistoryEntry[];
  contract: Contract | null;
  /** Increments whenever cells change — used by scene to know when to rebuild instances. */
  revision: number;
  /** Increments whenever layer visibility/lock/solo changes. */
  layerRevision: number;

  // ---- queries ----
  getBlock: (x: number, y: number, z: number) => BlockId | undefined;
  countBlocks: () => number;
  /** Compute Neural Integrity 0–1. Higher = more stable. */
  computeIntegrity: () => number;
  /** Bounding box of placed blocks (or null if empty). */
  computeBounds: () => { min: [number, number, number]; max: [number, number, number] } | null;

  // ---- mutations ----
  /** Apply a batch of placements as a single history entry. */
  applyOps: (ops: Array<{ x: number; y: number; z: number; block: BlockId | null }>, label: string) => void;
  setBlock: (x: number, y: number, z: number, block: BlockId | null, label?: string) => void;
  clearAll: () => void;
  loadSave: (save: SerializedSave) => void;
  setContract: (c: Contract | null) => void;

  // ---- layers ----
  setActiveLayer: (i: number) => void;
  toggleLayerVisibility: (i: number) => void;
  toggleLayerLock: (i: number) => void;
  toggleLayerSolo: (i: number) => void;
  renameLayer: (i: number, name: string) => void;
  setLayerOpacity: (i: number, opacity: number) => void;
  /** Move layer at displayIndex `from` to displayIndex `to` (display only — y stays fixed). */
  moveLayer: (from: number, to: number) => void;
  /** Returns layers sorted by their display order. */
  orderedLayers: () => VoxelLayer[];
  isLayerEditable: (i: number) => boolean;
  isLayerVisible: (i: number) => boolean;

  // ---- history ----
  undo: () => void;
  redo: () => void;
  jumpTo: (entryId: string) => void;
}

function makeLayers(): VoxelLayer[] {
  return Array.from({ length: WORLD_HEIGHT }, (_, i) => ({
    id: i,
    name: i === 0 ? 'Foundation' : i === WORLD_HEIGHT - 1 ? 'Spire Crown' : `Layer ${i.toString().padStart(2, '0')}`,
    visible: true,
    locked: false,
    solo: false,
    order: WORLD_HEIGHT - 1 - i, // top of panel = top of vault
    opacity: 1,
  }));
}

function ensureLayerDefaults(layers: VoxelLayer[]): VoxelLayer[] {
  // Saves from older versions may lack `order` and `opacity` — backfill.
  if (layers.every((l) => typeof l.order === 'number' && typeof l.opacity === 'number')) return layers;
  const len = layers.length;
  return layers.map((l, i) => ({
    ...l,
    order: l.order ?? len - 1 - (l.id ?? i),
    opacity: l.opacity ?? 1,
  }));
}

export const useVoxelStore = create<VoxelState>()(
  subscribeWithSelector((set, get) => ({
    cells: new Map(),
    layers: makeLayers(),
    activeLayer: 0,
    history: [],
    future: [],
    contract: null,
    revision: 0,
    layerRevision: 0,

    getBlock: (x, y, z) => get().cells.get(key(x, y, z)),

    countBlocks: () => get().cells.size,

    computeIntegrity: () => {
      const cells = get().cells;
      if (cells.size === 0) return 1;
      let total = 0;
      let anomaly = 0;
      for (const id of cells.values()) {
        const b = BLOCK_TYPES[id];
        total += b.stability;
        anomaly += b.anomaly;
      }
      const stability = total / cells.size;
      const anomalyPressure = Math.min(1, anomaly / Math.max(8, cells.size * 0.25));
      return Math.max(0, Math.min(1, stability * (1 - anomalyPressure * 0.7)));
    },

    computeBounds: () => {
      const cells = get().cells;
      if (cells.size === 0) return null;
      let mnx = Infinity, mny = Infinity, mnz = Infinity;
      let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      for (const k of cells.keys()) {
        const [x, y, z] = unkey(k);
        if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
        if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
      }
      return { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] };
    },

    applyOps: (ops, label) => {
      if (ops.length === 0) return;
      const cells = new Map(get().cells);
      const patch: HistoryEntry['patch'] = [];
      const editable = (y: number) => get().isLayerEditable(y);
      for (const op of ops) {
        if (!editable(op.y)) continue;
        const k = key(op.x, op.y, op.z);
        const before = cells.get(k) ?? null;
        const after = op.block;
        if (before === after) continue;
        if (after === null) cells.delete(k);
        else cells.set(k, after);
        patch.push([k, before, after]);
      }
      if (patch.length === 0) return;
      const entry: HistoryEntry = {
        id: uid(),
        label,
        timestamp: Date.now(),
        patch,
      };
      const history = [...get().history, entry].slice(-HISTORY_LIMIT);
      set({ cells, history, future: [], revision: get().revision + 1 });
    },

    setBlock: (x, y, z, block, label = block === null ? 'Erase' : `Place ${BLOCK_TYPES[block].name}`) => {
      get().applyOps([{ x, y, z, block }], label);
    },

    clearAll: () => {
      const cells = get().cells;
      if (cells.size === 0) return;
      const patch: HistoryEntry['patch'] = [];
      for (const [k, v] of cells.entries()) patch.push([k, v, null]);
      const entry: HistoryEntry = { id: uid(), label: 'Purge Vault', timestamp: Date.now(), patch };
      set({
        cells: new Map(),
        history: [...get().history, entry].slice(-HISTORY_LIMIT),
        future: [],
        revision: get().revision + 1,
      });
    },

    loadSave: (save) => {
      const cells = new Map<string, BlockId>();
      for (const [x, y, z, b] of save.cells) cells.set(key(x, y, z), b);
      const layers = save.layers.length === WORLD_HEIGHT ? ensureLayerDefaults(save.layers) : makeLayers();
      set({
        cells,
        layers,
        activeLayer: 0,
        history: [],
        future: [],
        contract: save.contract ?? null,
        revision: get().revision + 1,
        layerRevision: get().layerRevision + 1,
      });
    },

    setContract: (c) => set({ contract: c }),

    setActiveLayer: (i) => set({ activeLayer: i }),

    toggleLayerVisibility: (i) => {
      const layers = get().layers.map((l) => (l.id === i ? { ...l, visible: !l.visible } : l));
      set({ layers, layerRevision: get().layerRevision + 1 });
    },

    toggleLayerLock: (i) => {
      const layers = get().layers.map((l) => (l.id === i ? { ...l, locked: !l.locked } : l));
      set({ layers, layerRevision: get().layerRevision + 1 });
    },

    toggleLayerSolo: (i) => {
      const target = get().layers.find((l) => l.id === i);
      const newSolo = target ? !target.solo : true;
      const layers = get().layers.map((l) => ({ ...l, solo: l.id === i ? newSolo : false }));
      set({ layers, layerRevision: get().layerRevision + 1 });
    },

    renameLayer: (i, name) => {
      const layers = get().layers.map((l) => (l.id === i ? { ...l, name } : l));
      set({ layers });
    },

    setLayerOpacity: (i, opacity) => {
      const clamped = Math.max(0, Math.min(1, opacity));
      const layers = get().layers.map((l) => (l.id === i ? { ...l, opacity: clamped } : l));
      set({ layers, layerRevision: get().layerRevision + 1 });
    },

    moveLayer: (from, to) => {
      const ordered = get().orderedLayers().slice();
      if (from < 0 || from >= ordered.length || to < 0 || to >= ordered.length || from === to) return;
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      const orderById = new Map<number, number>();
      ordered.forEach((l, idx) => orderById.set(l.id, idx));
      const layers = get().layers.map((l) => ({ ...l, order: orderById.get(l.id) ?? l.order }));
      set({ layers, layerRevision: get().layerRevision + 1 });
    },

    orderedLayers: () => {
      return [...get().layers].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
    },

    isLayerEditable: (i) => {
      const layer = get().layers.find((l) => l.id === i);
      if (!layer) return false;
      if (layer.locked) return false;
      const solo = get().layers.find((l) => l.solo);
      if (solo && solo.id !== i) return false;
      return true;
    },

    isLayerVisible: (i) => {
      const layer = get().layers.find((l) => l.id === i);
      if (!layer) return false;
      const solo = get().layers.find((l) => l.solo);
      if (solo) return solo.id === i;
      return layer.visible;
    },

    undo: () => {
      const { history, future, cells } = get();
      const entry = history[history.length - 1];
      if (!entry) return;
      const next = new Map(cells);
      for (const [k, before] of entry.patch) {
        if (before === null) next.delete(k);
        else next.set(k, before);
      }
      set({
        cells: next,
        history: history.slice(0, -1),
        future: [...future, entry],
        revision: get().revision + 1,
      });
    },

    redo: () => {
      const { history, future, cells } = get();
      const entry = future[future.length - 1];
      if (!entry) return;
      const next = new Map(cells);
      for (const [k, , after] of entry.patch) {
        if (after === null) next.delete(k);
        else next.set(k, after);
      }
      set({
        cells: next,
        history: [...history, entry],
        future: future.slice(0, -1),
        revision: get().revision + 1,
      });
    },

    jumpTo: (entryId) => {
      const { history } = get();
      const idx = history.findIndex((h) => h.id === entryId);
      if (idx === -1) return;
      // Undo back to (and including) entries after idx
      const stepsBack = history.length - 1 - idx;
      for (let i = 0; i < stepsBack; i++) get().undo();
    },
  })),
);
