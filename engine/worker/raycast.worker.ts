// raycast.worker.ts — Phase 4. Owns a flat Uint8Array of blockIndex per cell
// and answers RAY_QUERY messages using Amanatides–Woo DDA voxel traversal.
//
// State sync: voxel.worker pushes `OCCUPANCY_DELTA` messages over a dedicated
// MessageChannel (see WorkerProtocol.OccupancyDelta). Pairs are
// (cellLinearIdx, blockIndex). 0 = cleared / air, non-zero = block present.
//
// Black-box rule: pure TS. No React, no Three.js, no Zustand. Imports are
// limited to `@/engine/bridge/WorkerProtocol` (types only) and `@/lib/*`.

/// <reference lib="webworker" />

import type {
  MainToRaycastMsg,
  RaycastToMainMsg,
  VoxelToRaycastMsg,
  WireRayHit,
} from '@/engine/bridge/WorkerProtocol';

// ---------------------------------------------------------------------------
// State (singleton per worker)
// ---------------------------------------------------------------------------

let occupancy: Uint8Array | null = null;
let worldX = 0;
let worldY = 0;
let worldZ = 0;
let halfX = 0; // x is centered on origin: world x in [-halfX, halfX)
let halfZ = 0; // z likewise
let lastVersion = -1;

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

function send(msg: RaycastToMainMsg): void {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

// ---------------------------------------------------------------------------
// Linear index helpers — must match `lib/utils.ts:cellLinearIdx`
// ---------------------------------------------------------------------------

function idxFromCell(cx: number, cy: number, cz: number): number {
  // Cell-space (0..worldX-1, 0..worldY-1, 0..worldZ-1). Returns the same
  // value as cellLinearIdx() in lib/utils for world coords (cx-halfX, cy, cz-halfZ).
  return cx + cz * worldX + cy * worldX * worldZ;
}

function inCellBounds(cx: number, cy: number, cz: number): boolean {
  return cx >= 0 && cx < worldX && cy >= 0 && cy < worldY && cz >= 0 && cz < worldZ;
}

// ---------------------------------------------------------------------------
// Occupancy delta application
// ---------------------------------------------------------------------------

function applyDelta(buffer: ArrayBuffer, version: number): void {
  if (!occupancy) return;
  // Stale-message drop: monotonic version. If a newer snapshot has already
  // arrived, skip older partials so they don't overwrite fresher state.
  if (version < lastVersion) return;
  lastVersion = version;

  const pairs = new Uint32Array(buffer);
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const cellIdx = pairs[i];
    const blockIndex = pairs[i + 1] & 0xff;
    if (cellIdx < occupancy.length) {
      occupancy[cellIdx] = blockIndex;
    }
  }
}

// ---------------------------------------------------------------------------
// Ray traversal (Amanatides–Woo DDA)
// ---------------------------------------------------------------------------

function raycast(
  origin: [number, number, number],
  direction: [number, number, number],
  maxSteps: number,
): WireRayHit | null {
  if (!occupancy) return null;

  const [ox, oy, oz] = origin;
  let [dx, dy, dz] = direction;

  // Normalize direction. A zero-length direction is a degenerate query.
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  // Shift world-space origin into cell-space so cell (0,0,0) starts at
  // (-halfX, 0, -halfZ). Cell coordinates are floor() of the shifted origin.
  const sx = ox + halfX;
  const sy = oy;
  const sz = oz + halfZ;

  let cx = Math.floor(sx);
  let cy = Math.floor(sy);
  let cz = Math.floor(sz);

  // Origin starts outside the world — advance the ray to the world AABB or
  // give up if it never enters.
  if (!inCellBounds(cx, cy, cz)) {
    const t = entryT(sx, sy, sz, dx, dy, dz);
    if (t === null) return null;
    const eps = 1e-4;
    const ex = sx + dx * (t + eps);
    const ey = sy + dy * (t + eps);
    const ez = sz + dz * (t + eps);
    cx = Math.floor(ex);
    cy = Math.floor(ey);
    cz = Math.floor(ez);
    if (!inCellBounds(cx, cy, cz)) return null;
  }

  // If origin is already inside a non-air cell, hit immediately.
  const startBlock = occupancy[idxFromCell(cx, cy, cz)];
  if (startBlock !== 0) {
    return {
      cell: [cx - halfX, cy, cz - halfZ],
      face: [0, 0, 0],
      blockIndex: startBlock,
      isAdjacentFace: false,
    };
  }

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  // Use the shifted origin (sx,sy,sz) consistently for tMax computation —
  // mixing it with the AABB-clipped entry point would skew the first step.
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz);

  let tMaxX =
    stepX === 0 ? Infinity : ((stepX > 0 ? cx + 1 - sx : sx - cx) / Math.abs(dx));
  let tMaxY =
    stepY === 0 ? Infinity : ((stepY > 0 ? cy + 1 - sy : sy - cy) / Math.abs(dy));
  let tMaxZ =
    stepZ === 0 ? Infinity : ((stepZ > 0 ? cz + 1 - sz : sz - cz) / Math.abs(dz));

  // Entry-face normal — set to -step on the axis crossed each iteration.
  let nx = 0, ny = 0, nz = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        cy += stepY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }

    if (!inCellBounds(cx, cy, cz)) return null;

    const blockIndex = occupancy[idxFromCell(cx, cy, cz)];
    if (blockIndex !== 0) {
      return {
        cell: [cx - halfX, cy, cz - halfZ],
        face: [nx, ny, nz],
        blockIndex,
        isAdjacentFace: true,
      };
    }
  }
  return null;
}

/**
 * Slab-method entry t for an AABB [0,worldX) × [0,worldY) × [0,worldZ) in
 * cell-space. Returns null if the ray misses the world.
 */
function entryT(
  sx: number, sy: number, sz: number,
  dx: number, dy: number, dz: number,
): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;

  const axes: Array<[number, number, number]> = [
    [sx, dx, worldX],
    [sy, dy, worldY],
    [sz, dz, worldZ],
  ];
  for (const [s, d, w] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (s < 0 || s >= w) return null;
      continue;
    }
    const t1 = (0 - s) / d;
    const t2 = (w - s) / d;
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    if (lo > tMin) tMin = lo;
    if (hi < tMax) tMax = hi;
    if (tMin > tMax) return null;
  }
  // Entry on or after the origin.
  return tMin >= 0 ? tMin : null;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

let voxelPort: MessagePort | null = null;

function handleVoxelMsg(msg: VoxelToRaycastMsg): void {
  if (msg.type === 'OCCUPANCY_DELTA') {
    applyDelta(msg.delta.buffer, msg.delta.version);
  }
}

self.onmessage = (ev: MessageEvent<MainToRaycastMsg>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'INIT': {
        worldX = msg.worldX;
        worldY = msg.worldY;
        worldZ = msg.worldZ;
        halfX = worldX >> 1;
        halfZ = worldZ >> 1;
        occupancy = new Uint8Array(worldX * worldY * worldZ);
        lastVersion = -1;

        if (voxelPort) {
          voxelPort.close();
          voxelPort = null;
        }
        voxelPort = msg.voxelPort;
        voxelPort.onmessage = (e: MessageEvent) => handleVoxelMsg(e.data);
        // Newer browsers require start() when assigning onmessage on a port.
        voxelPort.start?.();

        send({ type: 'READY' });
        break;
      }
      case 'RAY_QUERY': {
        const maxSteps = msg.maxSteps ?? (worldX + worldY + worldZ) * 2;
        const hit = raycast(msg.origin, msg.direction, maxSteps);
        send({ type: 'RAY_RESULT', requestId: msg.requestId, hit });
        break;
      }
      case 'DISPOSE': {
        if (voxelPort) {
          voxelPort.close();
          voxelPort = null;
        }
        occupancy = null;
        break;
      }
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'ERROR', message });
  }
};

export {};
