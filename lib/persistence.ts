'use client';

import { get, set, del, keys } from 'idb-keyval';
import { useUIStore } from '@/stores/uiStore';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import type { SerializedSave } from '@/types';
import { SAVE_DB_KEY, AUTOSAVE_KEY } from '@/lib/constants';

function encodeSave(data: SerializedSave): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function withLoading<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const ui = useUIStore.getState();
  ui.setLoading(message);
  try {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    return await fn();
  } finally {
    setTimeout(() => useUIStore.getState().setLoading(null), 240);
  }
}

const SAVE_PREFIX = 'save:';

export function buildSerialized(name: string, thumbnail?: string): SerializedSave {
  const engine = getVoxelEngine();
  const cells: SerializedSave['cells'] = [];
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (const d of engine.getAllCells()) {
    if (d.newBlockId === null) continue;
    cells.push([d.x, d.y, d.z, d.newBlockId]);
    if (d.x < mnx) mnx = d.x; if (d.y < mny) mny = d.y; if (d.z < mnz) mnz = d.z;
    if (d.x > mxx) mxx = d.x; if (d.y > mxy) mxy = d.y; if (d.z > mxz) mxz = d.z;
  }
  const bounds = cells.length
    ? { min: [mnx, mny, mnz] as [number, number, number], max: [mxx, mxy, mxz] as [number, number, number] }
    : { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
  return {
    version: 1,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    thumbnail,
    bounds,
    layers: engine.getLayers(),
    cells,
    contract: engine.getContract() ?? undefined,
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
    getVoxelEngine().loadSave(encodeSave(data));
    return true;
  });
}

export async function deleteSave(name: string) {
  await del(`${SAVE_PREFIX}${name}`);
}

export async function loadAutoSave(): Promise<boolean> {
  const data = await get<SerializedSave>(AUTOSAVE_KEY);
  if (!data) return false;
  getVoxelEngine().loadSave(encodeSave(data));
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
          getVoxelEngine().loadSave(encodeSave(data));
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
        getVoxelEngine().loadSave(encodeSave(data));
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
    getVoxelEngine().loadSave(encodeSave(data));
    return true;
  } catch {
    return false;
  }
}
