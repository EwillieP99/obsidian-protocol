import { describe, it, expect } from 'vitest';
import type { MainToVoxelMsg, WireDelta, WireOp } from '@/engine/bridge/WorkerProtocol';

/** Lightweight contract tests — message discriminant shapes stay stable. */
describe('WorkerProtocol message shapes', () => {
  it('MainToVoxel APPLY_OPS carries ops + label', () => {
    const ops: WireOp[] = [{ x: 0, y: 0, z: 0, blockIndex: 4, layer: 0 }];
    const msg: MainToVoxelMsg = { type: 'APPLY_OPS', ops, label: 'Paint' };
    expect(msg.type).toBe('APPLY_OPS');
    expect(msg.ops).toHaveLength(1);
    expect(msg.ops[0].blockIndex).toBe(4);
  });

  it('VoxelToMain PATCH carries deltas array', () => {
    const deltas: WireDelta[] = [{
      cellIdx: 1,
      x: 0,
      y: 0,
      z: 0,
      prevBlock: 0,
      newBlock: 4,
      layer: 0,
      opacity: 1,
    }];
    const msg = { type: 'PATCH' as const, deltas, label: 'Paint' };
    expect(msg.type).toBe('PATCH');
    expect(msg.deltas[0].newBlock).toBe(4);
  });

  it('UNDO/REDO are zero-payload control messages', () => {
    const undo: MainToVoxelMsg = { type: 'UNDO' };
    const redo: MainToVoxelMsg = { type: 'REDO' };
    expect(undo.type).toBe('UNDO');
    expect(redo.type).toBe('REDO');
  });

  it('INIT → APPLY_OPS → PATCH → UNDO sequence types compose', () => {
    const sequence: MainToVoxelMsg[] = [
      {
        type: 'INIT',
        worldX: 48,
        worldY: 16,
        worldZ: 48,
        chunkSize: 16,
        historyLimit: 100,
        layers: [{ id: 0, name: 'L0', order: 0, visible: true, locked: false, solo: false, opacity: 1 }],
        activeLayer: 0,
        blockTable: [{ blockId: 'obsidian', stability: 1, anomaly: 0, opacity: 1 }],
        contract: null,
        statsTickMs: 200,
      },
      { type: 'APPLY_OPS', ops: [{ x: 1, y: 0, z: 1, blockIndex: 1, layer: 0 }], label: 'Place' },
      { type: 'UNDO' },
    ];
    expect(sequence.map((m) => m.type)).toEqual(['INIT', 'APPLY_OPS', 'UNDO']);
  });
});
