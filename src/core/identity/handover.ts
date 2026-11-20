import { deriveKey } from './kdf';

// Short-lived hand-over of the EXTRACTABLE store key from the Register screen (the only place where the 12 words are in memory)
// to the Fingerprint offer screen (the next page). Only `enableFingerprint` needs this copy, to wrap it for the PRF level.
// Rules: memory only, never saved, forgotten as soon as the Fingerprint screen is left, and it never holds the 12 words themselves.
// If the page is reloaded in between, the copy is gone and the screen says so (the lock can be turned on later with the 12 words).

let pending: CryptoKey | null = null;

/** Keeps a ready-made extractable key (tests, or a caller that already derived one). */
export function holdFingerprintKey(key: CryptoKey): void {
  pending = key;
}

/**
 * Derives the extractable store key from the words and keeps it for the Fingerprint screen.
 * Never throws and never returns the key: invalid words or a browser without WebCrypto simply leave nothing behind.
 */
export async function prepareFingerprintKey(words: string): Promise<void> {
  pending = null;
  try {
    pending = await deriveKey(words, 'store', { extractable: true });
  } catch {
    pending = null;
  }
}

/** The kept key, or null. Reading does not remove it (React may render a screen twice); `clearFingerprintKey` does. */
export function peekFingerprintKey(): CryptoKey | null {
  return pending;
}

export function clearFingerprintKey(): void {
  pending = null;
}
