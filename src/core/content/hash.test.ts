// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

// Known answers from the SHA-256 standard / widely published test vectors. They are NOT computed with sha256Hex itself,
// so a wrong hash function (and with it every content manifest check) cannot pass by agreeing with itself.
describe('sha256Hex known answers', () => {
  it('hashes the empty string', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes a longer sentence', async () => {
    expect(await sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });
});

describe('sha256Hex input forms', () => {
  it('gives the same answer for text and for its UTF-8 bytes', async () => {
    const text = 'abc';
    expect(await sha256Hex(new TextEncoder().encode(text))).toBe(await sha256Hex(text));
  });

  it('hashes Gujarati text as UTF-8: lowercase hex, 64 characters, stable, and different from other text', async () => {
    const a = await sha256Hex('પરીક્ષા');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex('પરીક્ષા')).toBe(a);
    expect(await sha256Hex('પરીક્ષ')).not.toBe(a);
    expect(await sha256Hex(new TextEncoder().encode('પરીક્ષા'))).toBe(a);
  });

  it('hashes raw bytes (an image) and a one-byte change changes the hash', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);
    const changed = new Uint8Array(bytes);
    changed[7] = 254;
    expect(await sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(changed)).not.toBe(await sha256Hex(bytes));
  });
});
