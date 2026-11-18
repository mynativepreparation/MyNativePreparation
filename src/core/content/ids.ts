import type { IdPrefix } from './types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;
// Largest multiple of 36 below 256: bytes at or above it are skipped so every character is equally likely.
const LIMIT = 252;

/** Creates a stable id such as `crs-k3j9x0qa`. Ids are never reused and never change on rename or reorder. */
export function newId(prefix: IdPrefix): string {
  let out = '';
  while (out.length < ID_LENGTH) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < LIMIT && out.length < ID_LENGTH) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return `${prefix}-${out}`;
}

/** True when `value` is a string of the form `<prefix>-<8 chars of a-z0-9>`. */
export function isId(prefix: IdPrefix, value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${prefix}-[a-z0-9]{${ID_LENGTH}}$`).test(value);
}
