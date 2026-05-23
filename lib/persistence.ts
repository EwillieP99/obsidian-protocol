'use client';

import { get, set, del, keys } from 'idb-keyval';
import { useUIStore } from '@/stores/uiStore';
import { getVoxelEngine } from '@/engine/core/VoxelEngine';
import { isOBS2 } from '@/engine/persist/obs2';
import type { SerializedSave } from '@/types';
import { AUTOSAVE_KEY } from '@/lib/constants';

// Phase 5b: saves are written as binary OBS2 (engine.serialize()), stored in
// IndexedDB as ArrayBuffers. Migration is lazy and in-place — the idb keys are
// unchanged (`save:<name>`, AUTOSAVE_KEY), so V1 JSON saves still appear in the
// list and still load (a V1 object is re-encoded to a JSON ArrayBuffer and the
// engine sniffs OBS2-vs-JSON on load). Each save upgrades to binary the next
// time it's written. Repo example vaults remain `.json` and load via the same
// sniff, so nothing about them changes.

const SAVE_PREFIX = 'save:';

let autosaveInFlight = false;

/** A stored save is either a V2 binary buffer or a V1 JSON object (idb clone). */
type StoredSave = ArrayBuffer | SerializedSave;

/** JSON-encode a V1 save object into the ArrayBuffer shape engine.loadSave wants. */
function encodeSave(data: SerializedSave): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Normalize whatever idb returns into a buffer the engine can sniff + load. */
function toLoadBuffer(stored: StoredSave): ArrayBuffer {
  return stored instanceof ArrayBuffer ? stored : encodeSave(stored);
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

export async function captureThumbnail(): Promise<string | undefined> {
  // Find the WebGL canvas and snapshot it. The thumbnail is embedded in the
  // OBS2 buffer; no UI reads it back today, but it round-trips for later use.
  const canvas = document.querySelector('canvas');
  if (!canvas) return undefined;
  try {
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Save (binary)
// ---------------------------------------------------------------------------

export async function autoSave() {
  if (autosaveInFlight) return;
  autosaveInFlight = true;
  try {
    const thumb = await captureThumbnail();
    const buf = await getVoxelEngine().serialize('AUTOSAVE', thumb);
    await set(AUTOSAVE_KEY, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useUIStore.getState().setLastSaveError(msg);
    throw err;
  } finally {
    autosaveInFlight = false;
  }
}

export async function savePromptDialog(): Promise<boolean> {
  const name = window.prompt('Save vault as:', `Vault-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
  if (!name) return false;
  const thumb = await captureThumbnail();
  const buf = await getVoxelEngine().serialize(name, thumb);
  await set(`${SAVE_PREFIX}${name}`, buf);
  return true;
}

export async function listSaves(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith(SAVE_PREFIX))
    .map((k) => k.slice(SAVE_PREFIX.length));
}

export async function deleteSave(name: string) {
  await del(`${SAVE_PREFIX}${name}`);
}

// ---------------------------------------------------------------------------
// Load (format-agnostic — engine.loadSave sniffs OBS2 vs JSON)
// ---------------------------------------------------------------------------

export async function loadSave(name: string): Promise<boolean> {
  return withLoading(`LOADING ${name.toUpperCase()}`, async () => {
    const stored = await get<StoredSave>(`${SAVE_PREFIX}${name}`);
    if (!stored) return false;
    getVoxelEngine().loadSave(toLoadBuffer(stored));
    return true;
  });
}

export async function loadAutoSave(): Promise<boolean> {
  const stored = await get<StoredSave>(AUTOSAVE_KEY);
  if (!stored) return false;
  return withLoading('RESTORING AUTOSAVE', async () => {
    getVoxelEngine().loadSave(toLoadBuffer(stored));
    return true;
  });
}

// ---------------------------------------------------------------------------
// Import / export (file + URL)
// ---------------------------------------------------------------------------

export async function importSaveFromUrlWithLoading(url: string, label: string): Promise<boolean> {
  return withLoading(`IMPORTING ${label.toUpperCase()}`, async () => {
    return importSaveFromUrl(url);
  });
}

export async function importSaveFromUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    // Fetch raw bytes; the engine handles both OBS2 and legacy JSON saves.
    getVoxelEngine().loadSave(await r.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

export async function importSaveWithLoading(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.obs2,.json,application/json,application/octet-stream';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve();
      await withLoading(`IMPORTING ${file.name.toUpperCase()}`, async () => {
        try {
          // Pass raw bytes; engine.loadSave sniffs OBS2 magic, else parses JSON.
          getVoxelEngine().loadSave(await file.arrayBuffer());
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

export async function exportSave(): Promise<void> {
  const thumb = await captureThumbnail();
  const buf = await getVoxelEngine().serialize('export', thumb);
  // serialize() falls back to JSON if a worker is unavailable; pick the
  // extension from the actual bytes so the file is always named correctly.
  const ext = isOBS2(buf) ? 'obs2' : 'json';
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `obsidian-vault-${Date.now()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
