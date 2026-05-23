'use client';

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { getEngine } from '@/hooks/useEngine';
import { BLOCK_TYPES } from '@/lib/blocks';
import type { BlockId } from '@/types';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function boxAt(x: number, y: number, z: number, color: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.98, 0.98, 0.98);
  g.translate(x, y, z);
  const col = new THREE.Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

/** Build a merged mesh from all occupied cells (read-only export path). */
function buildVaultMesh(): THREE.Mesh {
  const cells = getEngine().getAllCells().filter((d) => d.newBlockId !== null);
  const geoms: THREE.BufferGeometry[] = [];

  for (const d of cells) {
    const blockId = d.newBlockId as BlockId;
    geoms.push(boxAt(d.x, d.y, d.z, BLOCK_TYPES[blockId].color));
  }

  if (geoms.length === 0) {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    );
  }

  const merged = mergeGeometries(geoms, false)!;
  for (const g of geoms) g.dispose();

  return new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.7 }),
  );
}

export async function exportVaultGltf(): Promise<void> {
  const mesh = buildVaultMesh();
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else {
          const json = JSON.stringify(result);
          resolve(new TextEncoder().encode(json).buffer as ArrayBuffer);
        }
      },
      reject,
      { binary: true },
    );
  });

  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();

  downloadBlob(new Blob([arrayBuffer], { type: 'model/gltf-binary' }), `obsidian-vault-${Date.now()}.glb`);
}
