'use client';

import { get, set, del, keys } from 'idb-keyval';
import { useVoxelStore } from '@/stores/voxelStore';
import { useUIStore } from '@/stores/uiStore';
import type { SerializedSave } from '@/types';
import { SAVE_DB_KEY, AUTOSAVE_KEY } from '@/lib/constants';
import { unkey } from '@/lib/utils';

async function withLoading<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const ui = useUIStore.getState();
  ui.setLoading(message);
  try {
    // Allow paint of veil before the heavy work begins.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    return await fn();
  } finally {
    // Hold a beat so users perceive the transition rather than a jarring cut.
    setTimeout(() => useUIStore.getState().setLoading(null), 240);
  }
}

const SAVE_PREFIX = 'save:';

export function buildSerialized(name: string, thumbnail?: string): SerializedSave {
  const store = useVoxelStore.getState();
  const cells: SerializedSave['cells'] = [];
  for (const [k, b] of store.cells.entries()) {
    const [x, y, z] = unkey(k);
    cells.push([x, y, z, b]);
  }
  const bounds = store.computeBounds() ?? { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
  return {
    version: 1,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thumbnail,
    bounds,
    layers: store.layers,
    cells,
    contract: store.contract ?? undefined,
  };
}

export async function captureThumbnail(): Promise<string | undefined> {
  // Find the WebGL canvas and snapshot it.
  const canvas = document.querySelector('canvas');
  if (!canvas) return undefined;
  try {
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}

export async function autoSave() {
  const thumb = await captureThumbnail();
  const data = buildSerialized('AUTOSAVE', thumb);
  await set(AUTOSAVE_KEY, data);
}

export async function savePromptDialog(): Promise<boolean> {
  const name = window.prompt('Save vault as:', `Vault-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
  if (!name) return false;
  const thumb = await captureThumbnail();
  const data = buildSerialized(name, thumb);
  await set(`${SAVE_PREFIX}${name}`, data);
  return true;
}

export async function listSaves(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith(SAVE_PREFIX))
    .map((k) => k.slice(SAVE_PREFIX.length));
}

export async function loadSave(name: string): Promise<boolean> {
  return withLoading(`LOADING ${name.toUpperCase()}`, async () => {
    const data = await get<SerializedSave>(`${SAVE_PREFIX}${name}`);
    if (!data) return false;
    useVoxelStore.getState().loadSave(data);
    return true;
  });
}

export async function deleteSave(name: string) {
  await del(`${SAVE_PREFIX}${name}`);
}

export async function loadAutoSave(): Promise<boolean> {
  const data = await get<SerializedSave>(AUTOSAVE_KEY);
  if (!data) return false;
  useVoxelStore.getState().loadSave(data);
  return true;
}

export async function importSaveFromUrlWithLoading(url: string, label: string): Promise<boolean> {
  return withLoading(`IMPORTING ${label.toUpperCase()}`, async () => {
    return importSaveFromUrl(url);
  });
}

export async function importSaveJSONWithLoading(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve();
      await withLoading(`IMPORTING ${file.name.toUpperCase()}`, async () => {
        try {
          const text = await file.text();
          const data = JSON.parse(text) as SerializedSave;
          if (!data.cells || !Array.isArray(data.cells)) throw new Error('Invalid save');
          useVoxelStore.getState().loadSave(data);
        } catch (e) {
          reject(e);
          return;
        }
      });
      resolve();
    };
    input.click();
  });
}

export async function exportSaveJSON(): Promise<void> {
  const thumb = await captureThumbnail();
  const data = buildSerialized('export', thumb);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `obsidian-vault-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSaveJSON(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return resolve();
        const text = await file.text();
        const data = JSON.parse(text) as SerializedSave;
        if (!data.cells || !Array.isArray(data.cells)) throw new Error('Invalid save');
        useVoxelStore.getState().loadSave(data);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export async function importSaveFromUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const data = (await r.json()) as SerializedSave;
    useVoxelStore.getState().loadSave(data);
    return true;
  } catch {
    return false;
  }
}
