// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IMAGE_ERROR_TEXT, readBytes } from './imageFile';

describe('IMAGE_ERROR_TEXT', () => {
  it('has a text key for every reason a picture can be refused', () => {
    expect(Object.keys(IMAGE_ERROR_TEXT).sort()).toEqual(['cannot_read', 'too_large', 'unsafe_svg', 'unsupported_type']);
  });

  it('gives each reason its own admin.blocks.err text key', () => {
    const keys = Object.values(IMAGE_ERROR_TEXT);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.startsWith('admin.blocks.err.'))).toBe(true);
  });
});

describe('readBytes', () => {
  it('returns the bytes of a file', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const result = await readBytes(new File([bytes.slice()], 'a.png', { type: 'image/png' }));
    expect(Array.from(result ?? [])).toEqual([0, 1, 2, 250, 255]);
  });

  it('returns an empty byte list for an empty file, not null', async () => {
    const result = await readBytes(new File([], 'empty.png'));
    expect(result).not.toBeNull();
    expect(Array.from(result ?? [])).toEqual([]);
  });

  it('returns null when the browser cannot read the file', async () => {
    const broken = { arrayBuffer: () => Promise.reject(new Error('cannot read')) } as unknown as File;
    expect(await readBytes(broken)).toBeNull();
  });
});
