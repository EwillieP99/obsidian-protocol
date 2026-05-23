'use client';

import { get, set, del, keys } from 'idb-keyval';
import type { BlockId } from '@/types/index';

export interface ArtifactCell {
  dx: number;
  dy: number;
  dz: number;
  blockId: BlockId;
  layer: number;
}

export interface Artifact {
  id: string;
  name: string;
  type: 'prefab' | 'blueprint';
  tags?: string[];
  thumbnail?: string;
  anchor: [number, number, number];
  cells: ArtifactCell[];
  createdAt: number;
}

const PREFIX = 'artifact:';

export async function saveArtifact(artifact: Artifact): Promise<void> {
  await set(`${PREFIX}${artifact.id}`, artifact);
}

export async function getArtifact(id: string): Promise<Artifact | undefined> {
  return get<Artifact>(`${PREFIX}${id}`);
}

export async function deleteArtifact(id: string): Promise<void> {
  await del(`${PREFIX}${id}`);
}

export async function listArtifacts(): Promise<Artifact[]> {
  const allKeys = await keys<string>();
  const artifactKeys = allKeys.filter((k) => k.startsWith(PREFIX));
  const results = await Promise.all(artifactKeys.map((k) => get<Artifact>(k)));
  const artifacts = results.filter((a): a is Artifact => a !== undefined);

  return artifacts.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'prefab' ? -1 : 1;
    }
    if (a.type === 'prefab') {
      return a.name.localeCompare(b.name);
    }
    return b.createdAt - a.createdAt;
  });
}

export async function seedPrefabs(prefabList: Artifact[]): Promise<void> {
  for (const prefab of prefabList) {
    const key = `${PREFIX}${prefab.id}`;
    const existing = await get(key);
    if (existing === undefined) {
      await set(key, prefab);
    }
  }
}

import { SHIPPED_PREFABS as _SHIPPED_PREFABS } from '@/lib/artifacts/prefabs';
export const SHIPPED_PREFABS: Artifact[] = _SHIPPED_PREFABS;

export function newArtifactId(): string {
  return `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
