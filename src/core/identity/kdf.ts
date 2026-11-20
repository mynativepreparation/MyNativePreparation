import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { checkMnemonic } from './mnemonic';

/**
 * FROZEN: changing the salt, an info string or the algorithms would make every existing user's data (and backup file)
 * unreadable. A test with fixed known answers guards this.
 */
const APP_SALT = 'np/salt/v1';
const INFO = {
  /** Encrypts the local database. */
  store: 'np/store/v1',
  /** Encrypts the backup file (P12). */
  backup: 'np/backup/v1',
} as const;

export type KeyPurpose = keyof typeof INFO;

export interface DerivedKeys {
  store: CryptoKey;
  backup: CryptoKey;
}

export interface DeriveOptions {
  /**
   * Default false: the key can be used but its bytes can never be read back.
   * `true` is only for wrapping a copy of the key for the fingerprint lock, while the 12 words are still in memory.
   */
  extractable?: boolean;
}

const encoder = new TextEncoder();

/**
 * Turns the 12 words into one AES-256-GCM key for one purpose: entropy -> HKDF-SHA-256 (fixed salt, one `info` per purpose).
 * HKDF (not a slow password hash) is right here because the secret is 128 random bits, not a human-chosen password.
 * Throws a RangeError (message without any words) if the phrase is not a valid 12-word key; callers check with `checkMnemonic` first.
 */
export async function deriveKey(words: string, purpose: KeyPurpose, options: DeriveOptions = {}): Promise<CryptoKey> {
  const checked = checkMnemonic(words);
  if (!checked.ok) throw new RangeError('Not a valid 12-word key');

  const entropy = mnemonicToEntropy(checked.words, wordlist);
  try {
    const base = await globalThis.crypto.subtle.importKey('raw', entropy, 'HKDF', false, ['deriveKey']);
    return await globalThis.crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(APP_SALT), info: encoder.encode(INFO[purpose]) },
      base,
      { name: 'AES-GCM', length: 256 },
      options.extractable === true,
      ['encrypt', 'decrypt'],
    );
  } finally {
    entropy.fill(0); // best effort: JavaScript cannot guarantee that no other copy exists
  }
}

/** Both keys at once (local store key and backup key). */
export async function deriveKeys(words: string): Promise<DerivedKeys> {
  const [store, backup] = await Promise.all([deriveKey(words, 'store'), deriveKey(words, 'backup')]);
  return { store, backup };
}
