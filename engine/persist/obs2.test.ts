import { describe, it, expect } from 'vitest';
import { CHUNK_VOLUME } from '@/lib/constants';
import { encodeOBS2, decodeOBS2, isOBS2 } from '@/engine/persist/obs2';
import type { LayerMeta } from '@/types/engine';

describe('OBS2 codec', () => {
  const layers: LayerMeta[] = [
    { id: 0, name: 'Foundation', order: 0, visible: true, locked: false, solo: false, opacity: 1 },
  ];

  it('isOBS2 detects magic bytes', () => {
    const cells = new Uint16Array(CHUNK_VOLUME);
    cells[100] = 0x0004; // layer 0, block index 4
    const buf = encodeOBS2({
      chunks: [{ cx: 0, cy: 0, cz: 0, data: cells.buffer }],
      layers,
      contract: null,
      name: 'test-vault',
      cellCount: 1,
    });
    expect(isOBS2(buf)).toBe(true);
    expect(isOBS2(new ArrayBuffer(8))).toBe(false);
  });

  it('encode/decode round-trips chunk data and metadata', () => {
    const cells = new Uint16Array(CHUNK_VOLUME);
    cells[0] = 0x0106; // layer 1, block 6
    cells[1] = 0x0106;
    cells[2] = 0x0000;
    cells[50] = 0x0207;

    const input = {
      chunks: [{ cx: 0, cy: 0, cz: 0, data: cells.buffer }],
      layers,
      contract: null,
      name: 'Roundtrip',
      cellCount: 3,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
    };

    const encoded = encodeOBS2(input);
    const decoded = decodeOBS2(encoded);

    expect(decoded.name).toBe('Roundtrip');
    expect(decoded.cellCount).toBe(3);
    expect(decoded.layers).toHaveLength(1);
    expect(decoded.layers[0].name).toBe('Foundation');
    expect(decoded.chunks).toHaveLength(1);

    const out = new Uint16Array(decoded.chunks[0].data);
    expect(out[0]).toBe(0x0106);
    expect(out[1]).toBe(0x0106);
    expect(out[2]).toBe(0);
    expect(out[50]).toBe(0x0207);
  });

  it('RLE compresses long air runs', () => {
    const cells = new Uint16Array(CHUNK_VOLUME);
    cells[CHUNK_VOLUME - 1] = 0x0001;
    const buf = encodeOBS2({
      chunks: [{ cx: 0, cy: 0, cz: 0, data: cells.buffer }],
      layers,
      contract: null,
      name: 'sparse',
      cellCount: 1,
    });
    // Sparse chunk should be much smaller than raw 8192 bytes + header
    expect(buf.byteLength).toBeLessThan(512);
  });
});
