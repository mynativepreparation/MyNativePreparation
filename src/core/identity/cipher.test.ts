// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptJson, DecryptError, encryptJson, type Envelope } from './cipher';
import { deriveKey } from './kdf';

const WORDS = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const OTHER_WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let key: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  key = await deriveKey(WORDS, 'store');
  otherKey = await deriveKey(OTHER_WORDS, 'store');
});

function b64urlToBytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64url'));
}

function bytesToB64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

describe('round trip', () => {
  const values: Array<[string, unknown]> = [
    ['a string', 'hello'],
    ['the empty string', ''],
    ['Gujarati text', 'ગુજરાતી પરીક્ષા તૈયારી'],
    ['emoji', 'star ⭐ and 😀'],
    ['null', null],
    ['a number', 42.5],
    ['a boolean', false],
    ['an array', [1, 'two', { three: 3 }]],
    ['a nested object', { name: 'Asha', email: 'asha@example.com', phone: '98250 00000', scores: [90, 75] }],
  ];

  it.each(values)('%s comes back unchanged', async (_label, value) => {
    const sealed = await encryptJson(key, value, 'profile:me');
    expect(await decryptJson(key, sealed, 'profile:me')).toEqual(value);
  });

  it('handles a large payload (200 KB)', async () => {
    const big = 'x'.repeat(200_000);
    const sealed = await encryptJson(key, big, 'kv:big');
    expect(await decryptJson(key, sealed, 'kv:big')).toBe(big);
  });
});

describe('envelope', () => {
  it('has version 1, a 12-byte IV, base64url text only, and hides the plaintext', async () => {
    const sealed = await encryptJson(key, { name: 'Asha Patel' }, 'profile:me');
    expect(sealed.v).toBe(1);
    expect(b64urlToBytes(sealed.iv)).toHaveLength(12);
    expect(sealed.iv).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed.ct).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(sealed)).not.toContain('Asha');
    expect(JSON.stringify(sealed)).not.toContain('Patel');
  });

  it('uses a new IV every time: 1000 encryptions of the same value give 1000 different IVs and ciphertexts', async () => {
    const ivs = new Set<string>();
    const cts = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const sealed = await encryptJson(key, 'same value', 'kv:x');
      ivs.add(sealed.iv);
      cts.add(sealed.ct);
    }
    expect(ivs.size).toBe(1000);
    expect(cts.size).toBe(1000);
  });

  it('refuses values that cannot be stored as JSON', async () => {
    await expect(encryptJson(key, undefined, 'x')).rejects.toBeInstanceOf(TypeError);
    await expect(encryptJson(key, () => 1, 'x')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('failures are DecryptError, never a crash', () => {
  async function sealed(): Promise<Envelope> {
    return encryptJson(key, { secret: 'value' }, 'attempts:7');
  }

  it('wrong key', async () => {
    await expect(decryptJson(otherKey, await sealed(), 'attempts:7')).rejects.toMatchObject({
      name: 'DecryptError',
      reason: 'auth_failed',
    });
  });

  it('wrong AAD (a value moved to another row)', async () => {
    await expect(decryptJson(key, await sealed(), 'attempts:8')).rejects.toMatchObject({ reason: 'auth_failed' });
    await expect(decryptJson(key, await sealed(), 'readProgress:7')).rejects.toMatchObject({ reason: 'auth_failed' });
  });

  it('a flipped ciphertext byte', async () => {
    const s = await sealed();
    const ct = b64urlToBytes(s.ct);
    ct[0] ^= 0x01;
    await expect(decryptJson(key, { ...s, ct: bytesToB64url(ct) }, 'attempts:7')).rejects.toMatchObject({
      reason: 'auth_failed',
    });
  });

  it('a flipped tag byte (last byte)', async () => {
    const s = await sealed();
    const ct = b64urlToBytes(s.ct);
    ct[ct.length - 1] ^= 0x80;
    await expect(decryptJson(key, { ...s, ct: bytesToB64url(ct) }, 'attempts:7')).rejects.toMatchObject({
      reason: 'auth_failed',
    });
  });

  it('a changed IV', async () => {
    const s = await sealed();
    const iv = b64urlToBytes(s.iv);
    iv[0] ^= 0x01;
    await expect(decryptJson(key, { ...s, iv: bytesToB64url(iv) }, 'attempts:7')).rejects.toMatchObject({
      reason: 'auth_failed',
    });
  });

  it('truncated ciphertext (shorter than the tag, and longer but cut)', async () => {
    const s = await sealed();
    const ct = b64urlToBytes(s.ct);
    await expect(decryptJson(key, { ...s, ct: bytesToB64url(ct.slice(0, 8)) }, 'attempts:7')).rejects.toMatchObject({
      reason: 'bad_envelope',
    });
    await expect(decryptJson(key, { ...s, ct: bytesToB64url(ct.slice(0, ct.length - 3)) }, 'attempts:7')).rejects.toMatchObject({
      reason: 'auth_failed',
    });
  });

  it('an unknown envelope version', async () => {
    const s = await sealed();
    await expect(decryptJson(key, { ...s, v: 2 }, 'attempts:7')).rejects.toMatchObject({ reason: 'bad_envelope' });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'text'],
    ['a number', 7],
    ['an empty object', {}],
    ['an array', []],
    ['a missing ct', { v: 1, iv: 'AAAAAAAAAAAAAAAA' }],
    ['a wrong IV length', { v: 1, iv: 'AAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }],
    ['non-base64url characters', { v: 1, iv: '***', ct: '***' }],
    ['non-string fields', { v: 1, iv: 1, ct: 2 }],
  ])('input that is not an envelope: %s', async (_label, input) => {
    await expect(decryptJson(key, input, 'x')).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptJson(key, input, 'x')).rejects.toMatchObject({ reason: 'bad_envelope' });
  });

  it('error messages never contain the data', async () => {
    const s = await encryptJson(key, { secret: 'topsecretvalue' }, 'attempts:7');
    const error = (await decryptJson(otherKey, s, 'attempts:7').catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain('topsecretvalue');
    expect(String(error)).not.toContain('topsecretvalue');
  });
});
