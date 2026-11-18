// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { newId, isId } from './ids';
import { sha256Hex } from './hash';

describe('newId', () => {
  it('has the form <prefix>-<8 chars of a-z0-9>', () => {
    for (const prefix of ['crs', 'blk', 'qst', 'tst'] as const) {
      expect(newId(prefix)).toMatch(new RegExp(`^${prefix}-[a-z0-9]{8}$`));
    }
  });

  it('is unique over 1000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newId('blk'));
    expect(seen.size).toBe(1000);
  });
});

describe('isId', () => {
  it('accepts a generated id of the same prefix', () => {
    expect(isId('crs', newId('crs'))).toBe(true);
  });

  it('rejects wrong prefix, wrong length, uppercase and non-strings', () => {
    expect(isId('crs', newId('blk'))).toBe(false);
    expect(isId('crs', 'crs-abc')).toBe(false);
    expect(isId('crs', 'crs-ABCDEFGH')).toBe(false);
    expect(isId('crs', 'crs-abcdefgh9')).toBe(false);
    expect(isId('crs', null)).toBe(false);
    expect(isId('crs', 42)).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the known SHA-256 of the empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('gives the same result for text and for its UTF-8 bytes', async () => {
    const text = 'ગુજરાતી';
    expect(await sha256Hex(new TextEncoder().encode(text))).toBe(await sha256Hex(text));
  });
});
