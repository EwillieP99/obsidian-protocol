import { describe, it, expect } from 'vitest';
import {
  decodeOBS2,
  encodeOBS2,
  OBS2_MAX_BUFFER_BYTES,
  OBS2_MAX_CHUNK_COUNT,
} from '@/engine/persist/obs2';
import type { LayerMeta } from '@/types/engine';

describe('OBS2 decode limits', () => {
  const layers: LayerMeta[] = [
    { id: 0, name: 'L0', order: 0, visible: true, locked: false, solo: false, opacity: 1 },
  ];

  it('rejects buffers larger than OBS2_MAX_BUFFER_BYTES', () => {
    const huge = new ArrayBuffer(OBS2_MAX_BUFFER_BYTES + 1);
    new Uint8Array(huge).set([0x4f, 0x42, 0x53, 0x32]);
    expect(() => decodeOBS2(huge)).toThrow(/too large/);
  });

  it('rejects absurd chunk counts in header', () => {
    const cells = new Uint16Array(4096);
    const buf = encodeOBS2({
      chunks: [{ cx: 0, cy: 0, cz: 0, data: cells.buffer }],
      layers,
      contract: null,
      name: 'ok',
      cellCount: 0,
    });
    const view = new DataView(buf);
    // chunkCount offset: magic(4) + version(2) + flags(2) + world(6) + chunkSize(1) = 15
    view.setUint32(15, OBS2_MAX_CHUNK_COUNT + 1, true);
    expect(() => decodeOBS2(buf)).toThrow(/chunkCount/);
  });
});
