import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetVoxelEngineForTests, getVoxelEngine } from '@/engine/core/VoxelEngine';
import type { MainToVoxelMsg, VoxelToMainMsg } from '@/engine/bridge/WorkerProtocol';

/**
 * Behavioral round-trip without a real Web Worker (Node 20 lacks global Worker).
 * Validates INIT → APPLY_OPS → PATCH → UNDO message flow through VoxelEngine.
 */
describe('VoxelEngine worker protocol round-trip (mock worker)', () => {
  let posted: MainToVoxelMsg[] = [];

  beforeEach(() => {
    posted = [];
    __resetVoxelEngineForTests();
    vi.stubGlobal(
      'Worker',
      class MockWorker {
        onmessage: ((ev: MessageEvent<VoxelToMainMsg>) => void) | null = null;
        onerror: ((ev: ErrorEvent) => void) | null = null;
        constructor(_url: URL, _opts?: WorkerOptions) {
          void _url;
          void _opts;
        }
        postMessage(msg: MainToVoxelMsg) {
          posted.push(msg);
          queueMicrotask(() => this.dispatch(msg));
        }
        private dispatch(msg: MainToVoxelMsg) {
          if (msg.type === 'INIT') {
            this.onmessage?.({ data: { type: 'READY' } } as MessageEvent<VoxelToMainMsg>);
          }
          if (msg.type === 'APPLY_OPS') {
            const op = msg.ops[0];
            this.onmessage?.({
              data: {
                type: 'PATCH',
                label: msg.label,
                deltas: [{
                  cellIdx: 0,
                  x: op.x,
                  y: op.y,
                  z: op.z,
                  prevBlock: 0,
                  newBlock: op.blockIndex,
                  layer: op.layer,
                  opacity: 1,
                }],
              },
            } as MessageEvent<VoxelToMainMsg>);
          }
          if (msg.type === 'UNDO') {
            this.onmessage?.({
              data: {
                type: 'PATCH',
                label: 'Undo',
                deltas: [{
                  cellIdx: 0,
                  x: 0,
                  y: 0,
                  z: 0,
                  prevBlock: 1,
                  newBlock: 0,
                  layer: 0,
                  opacity: 0,
                }],
              },
            } as MessageEvent<VoxelToMainMsg>);
          }
        }
        terminate() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetVoxelEngineForTests();
  });

  it('INIT → APPLY_OPS → PATCH → UNDO', async () => {
    const engine = getVoxelEngine();
    await engine.init();
    expect(engine.isWorkerReady()).toBe(true);

    const patches: string[] = [];
    engine.on('patch', (e) => patches.push(e.label));

    engine.applyOps([{ x: 0, y: 0, z: 0, blockId: 'obsidian', layer: 0 }], 'Place test');
    await new Promise((r) => setTimeout(r, 10));
    expect(posted.some((m) => m.type === 'APPLY_OPS')).toBe(true);
    expect(patches).toContain('Place test');

    engine.undo();
    await new Promise((r) => setTimeout(r, 10));
    expect(posted.some((m) => m.type === 'UNDO')).toBe(true);
    expect(patches).toContain('Undo');
  });
});
