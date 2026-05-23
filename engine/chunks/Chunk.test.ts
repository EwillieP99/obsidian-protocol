import { describe, it, expect } from 'vitest';
import { Chunk, packCell, unpackBlock, unpackLayer } from '@/engine/chunks/Chunk';

describe('Chunk pack/unpack', () => {
  it('packCell and unpack round-trip block and layer', () => {
    const packed = packCell(4, 2);
    expect(unpackBlock(packed)).toBe(4);
    expect(unpackLayer(packed)).toBe(2);
  });

  it('tracks non-air count on writes', () => {
    const chunk = new Chunk();
    expect(chunk.count).toBe(0);
    chunk.data[0] = packCell(3, 0);
    chunk.count = 1;
    expect(chunk.isEmpty()).toBe(false);
  });
});
