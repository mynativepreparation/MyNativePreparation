// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deriveKey, deriveKeys } from './kdf';
import { decryptJson, DecryptError, encryptJson } from './cipher';

const ZERO_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SEVEN_F_VECTOR = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('deriveKey known answers (FROZEN: a change here would lock users out of their data)', () => {
  // Computed independently with Node's crypto.hkdfSync('sha256', entropy, 'np/salt/v1', info, 32).
  const cases: Array<[string, 'store' | 'backup', string]> = [
    [ZERO_VECTOR, 'store', 'c17d1d0e557d5e4559192f9bf66394a20daadc11816beb3c2844f4faac72d2f2'],
    [ZERO_VECTOR, 'backup', '63017ab99151552439b6e9e2cf4c14692d8beacd2131e70e61258f221a4140ab'],
    [SEVEN_F_VECTOR, 'store', 'be7e4597a6418201995a0b239e26739576d102dcf54585adc81970e8bbf820a4'],
    [SEVEN_F_VECTOR, 'backup', '3254cd6048d4bf143bc827d6371bc6c9df854282e40c52598c457f21f29c583d'],
  ];

  it.each(cases)('%s / %s gives the expected 32 key bytes', async (words, purpose, expected) => {
    const key = await deriveKey(words, purpose, { extractable: true });
    expect(hex(await globalThis.crypto.subtle.exportKey('raw', key))).toBe(expected);
  });
});

describe('deriveKey', () => {
  it('gives a non-extractable AES-GCM 256 key by default', async () => {
    const key = await deriveKey(ZERO_VECTOR, 'store');
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('gives an exportable key only when asked', async () => {
    const key = await deriveKey(ZERO_VECTOR, 'store', { extractable: true });
    expect(key.extractable).toBe(true);
    expect((await globalThis.crypto.subtle.exportKey('raw', key)).byteLength).toBe(32);
  });

  it('is repeatable: data sealed with one derivation opens with another derivation of the same words', async () => {
    const first = await deriveKey(SEVEN_F_VECTOR, 'store');
    const second = await deriveKey(`  ${SEVEN_F_VECTOR.toUpperCase()} \n`, 'store');
    const sealed = await encryptJson(first, { name: 'Asha' }, 'profile:me');
    expect(await decryptJson(second, sealed, 'profile:me')).toEqual({ name: 'Asha' });
  });

  it('keeps the store key and the backup key apart', async () => {
    const { store, backup } = await deriveKeys(ZERO_VECTOR);
    const sealed = await encryptJson(store, 'secret', 'x');
    await expect(decryptJson(backup, sealed, 'x')).rejects.toBeInstanceOf(DecryptError);
  });

  it('gives different keys for different words', async () => {
    const a = await deriveKey(ZERO_VECTOR, 'store');
    const b = await deriveKey(SEVEN_F_VECTOR, 'store');
    const sealed = await encryptJson(a, 'secret', 'x');
    await expect(decryptJson(b, sealed, 'x')).rejects.toMatchObject({ reason: 'auth_failed' });
  });

  it('rejects an invalid phrase with a RangeError that does not contain the words', async () => {
    const bad = 'legal winner thank year wave sausage worth useful legal winner thank notaword';
    const error = await deriveKey(bad, 'store').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).not.toContain('legal');
    expect((error as Error).message).not.toContain('notaword');
  });

  it('rejects non-text input without a crash other than RangeError', async () => {
    for (const bad of [null, undefined, 42, {}] as unknown as string[]) {
      await expect(deriveKey(bad, 'store')).rejects.toBeInstanceOf(RangeError);
    }
  });
});
