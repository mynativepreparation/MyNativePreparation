// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './cipher';
import { clearFingerprintKey, holdFingerprintKey, peekFingerprintKey, prepareFingerprintKey } from './handover';
import { deriveKey } from './kdf';

const WORDS = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

afterEach(() => {
  clearFingerprintKey();
});

describe('fingerprint key hand-over', () => {
  it('holds nothing at the start', () => {
    expect(peekFingerprintKey()).toBeNull();
  });

  it('prepares an extractable copy of the SAME store key (data encrypted with the normal key opens with it)', async () => {
    await prepareFingerprintKey(WORDS);
    const copy = peekFingerprintKey();
    if (copy === null) throw new Error('expected a prepared key');
    expect(copy.extractable).toBe(true);

    const normal = await deriveKey(WORDS, 'store');
    expect(normal.extractable).toBe(false);
    const envelope = await encryptJson(normal, { text: 'ગુજરાતી' }, 'test:1');
    expect(await decryptJson(copy, envelope, 'test:1')).toEqual({ text: 'ગુજરાતી' });
  });

  it('reading does not remove the key (a screen may render twice); clearing does', async () => {
    await prepareFingerprintKey(WORDS);
    expect(peekFingerprintKey()).not.toBeNull();
    expect(peekFingerprintKey()).not.toBeNull();
    clearFingerprintKey();
    expect(peekFingerprintKey()).toBeNull();
  });

  it('never throws for invalid words and leaves nothing behind', async () => {
    await expect(prepareFingerprintKey('these are not twelve valid words')).resolves.toBeUndefined();
    expect(peekFingerprintKey()).toBeNull();
    await expect(prepareFingerprintKey('')).resolves.toBeUndefined();
    expect(peekFingerprintKey()).toBeNull();
  });

  it('a failed preparation also forgets an older key (no stale key from a previous Register)', async () => {
    await prepareFingerprintKey(WORDS);
    expect(peekFingerprintKey()).not.toBeNull();
    await prepareFingerprintKey('garbage');
    expect(peekFingerprintKey()).toBeNull();
  });

  it('can keep a ready-made key', async () => {
    const key = await deriveKey(WORDS, 'store', { extractable: true });
    holdFingerprintKey(key);
    expect(peekFingerprintKey()).toBe(key);
  });
});
