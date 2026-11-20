/** What is stored in the database instead of readable data. `iv` and `ct` are base64url text. */
export interface Envelope {
  v: 1;
  iv: string;
  ct: string;
}

export type DecryptProblem = 'bad_envelope' | 'auth_failed';

/**
 * Thrown when stored data cannot be read: wrong key, wrong place (AAD), damaged or unknown format.
 * The message is fixed text and never contains data; use `reason` to tell the cases apart.
 */
export class DecryptError extends Error {
  readonly reason: DecryptProblem;

  constructor(reason: DecryptProblem) {
    super(reason === 'bad_envelope' ? 'Stored data has an unknown or damaged format' : 'Stored data could not be decrypted');
    this.name = 'DecryptError';
    this.reason = reason;
  }
}

const IV_BYTES = 12; // 96 bits, the size recommended for AES-GCM
const TAG_BYTES = 16; // AES-GCM authentication tag, appended to the ciphertext

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reverses `toBase64Url`. Throws `DecryptError('bad_envelope')` for text that is not valid base64url. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new DecryptError('bad_envelope');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new DecryptError('bad_envelope');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Encrypts any JSON value with AES-256-GCM. A NEW random 96-bit IV is made for every call (an IV is never reused with the same key).
 * `aad` (additional authenticated data) names the place the data belongs to, e.g. `attempts:42`;
 * decrypting with a different `aad` fails, so a stored value cannot be moved to another row unnoticed.
 */
export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<Envelope> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Value cannot be stored as JSON');

  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(json),
  );
  return { v: 1, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(sealed)) };
}

/** Reverses `encryptJson`. Throws `DecryptError` for a wrong key, wrong `aad`, tampering, or an input that is not an envelope. */
export async function decryptJson<T = unknown>(key: CryptoKey, envelope: unknown, aad: string): Promise<T> {
  if (typeof envelope !== 'object' || envelope === null) throw new DecryptError('bad_envelope');
  const { v, iv, ct } = envelope as Record<string, unknown>;
  if (v !== 1 || typeof iv !== 'string' || typeof ct !== 'string') throw new DecryptError('bad_envelope');

  const ivBytes = fromBase64Url(iv);
  const ctBytes = fromBase64Url(ct);
  if (ivBytes.length !== IV_BYTES || ctBytes.length < TAG_BYTES) throw new DecryptError('bad_envelope');

  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes, additionalData: encoder.encode(aad) },
      key,
      ctBytes,
    );
  } catch {
    throw new DecryptError('auth_failed');
  }
  try {
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    throw new DecryptError('bad_envelope');
  }
}
