import { decryptJson, encryptJson } from './cipher';
import { deriveKey } from './kdf';
import { clearStoreKey, isUnlocked, setEnrolKey, setStoreKey } from './keyring';
import { checkMnemonic, type MnemonicCheck, type MnemonicProblem } from './mnemonic';
import { getSetting, setSetting } from '../storage/repo';
import {
  clearSessionRecords,
  deleteSessionRecord,
  getSessionRecord,
  putSessionRecord,
} from '../storage/sessionStore';
import { wire } from '../wire/wire';

// Session = who is logged in on this device (P04 plan, DECISIONS Q16).
// The 12 words are only ever PARAMETERS of createIdentity() and unlock(): they are turned into a key at once and never saved,
// logged or put into a result or an error.

export { clearEnrolKey, getEnrolKey, getStoreKey, isUnlocked, LockedError } from './keyring';

/** Best effort: keeps an extractable copy of the store key in memory so the fingerprint lock can be turned on right after Register/Login. Never throws. */
async function rememberEnrolKey(words: string): Promise<void> {
  try {
    setEnrolKey(await deriveKey(words, 'store', { extractable: true }));
  } catch {
    // no enrolment key: the fingerprint offer then asks the person to log in with the 12 words first
  }
}

/** Plain `kv` setting that holds the encrypted key check. Survives Log out on purpose (it is how a wrong key is recognised later). */
const CHECK_SETTING = 'identity.check';
/** AAD of the key check; the same naming style as the table rows (`<table>:<key>`). */
const CHECK_AAD = 'kv:identity.check';
const CHECK_TEXT = 'np-key-check-v1';
/** Id of the persisted store key inside the separate session database (the fingerprint lock also reads and removes it). */
export const STORE_KEY_RECORD = 'store-key';
/** Id of the fingerprint-lock record in the session database. Defined here (not in biometric.ts) so this file can read it without importing biometric.ts (circular). */
export const FINGERPRINT_RECORD = 'fingerprint';
/** Id of the PIN-lock record in the session database (pin.ts reads and writes it; defined here for the same reason as FINGERPRINT_RECORD). */
export const PIN_RECORD = 'pin';

export interface InvalidWords {
  status: 'invalid_words';
  problem: MnemonicProblem;
  /** For `wrong_count`: how many words were found. */
  count?: number;
  /** For `unknown_word`: 1-based position of the first unknown word (never the word itself). */
  wordNumber?: number;
}

export type CreateResult =
  | {
      status: 'ok';
      /** False when the browser could not save the key for later opens; the app then asks for the 12 words next time. */
      persisted: boolean;
    }
  | InvalidWords;

export type UnlockResult = CreateResult | { status: 'wrong_key' };

export type RestoreResult = 'restored' | 'none';

function invalidWords(check: Extract<MnemonicCheck, { ok: false }>): InvalidWords {
  const result: InvalidWords = { status: 'invalid_words', problem: check.reason };
  if (check.count !== undefined) result.count = check.count;
  if (check.wordNumber !== undefined) result.wordNumber = check.wordNumber;
  return result;
}

type CheckState = 'match' | 'mismatch' | 'no_check';

/** Compares a key against the saved key check. Never throws for a wrong key. */
async function compareWithCheck(key: CryptoKey): Promise<CheckState> {
  const saved = await getSetting(CHECK_SETTING);
  if (saved === undefined) return 'no_check';
  try {
    const text = await decryptJson<string>(key, saved, CHECK_AAD);
    return text === CHECK_TEXT ? 'match' : 'mismatch';
  } catch {
    return 'mismatch'; // DecryptError: wrong key, or the saved check is damaged
  }
}

async function writeCheck(key: CryptoKey): Promise<void> {
  await setSetting(CHECK_SETTING, await encryptJson(key, CHECK_TEXT, CHECK_AAD));
}

/** True only if this key opens the saved key check (so it is the key of the data on this device). Never throws. */
export async function opensKeyCheck(key: CryptoKey): Promise<boolean> {
  try {
    return (await compareWithCheck(key)) === 'match';
  } catch {
    return false;
  }
}

/**
 * Used by the fingerprint unlock (biometric.ts): makes `key` the unlocked store key, but only if it opens the key check.
 * A wrong key changes nothing and returns false. Emits `identity:unlocked` on success.
 */
export async function adoptKey(key: CryptoKey): Promise<boolean> {
  if (!(await opensKeyCheck(key))) return false;
  setStoreKey(key);
  wire.emit('identity:unlocked', {});
  return true;
}

/**
 * True when a valid PRF-level fingerprint lock exists (same validity rule as getFingerprintState in biometric.ts: a damaged record counts as no lock).
 * Under that lock the plain key must stay deleted, otherwise the fingerprint would protect nothing. Never throws.
 */
async function hasPrfLock(): Promise<boolean> {
  try {
    const saved = await getSessionRecord(FINGERPRINT_RECORD);
    if (typeof saved !== 'object' || saved === null) return false;
    const record = saved as Record<string, unknown>;
    return (
      record.v === 1 &&
      record.level === 'prf' &&
      typeof record.credentialId === 'string' &&
      typeof record.wrapped === 'object' &&
      record.wrapped !== null
    );
  } catch {
    return false;
  }
}

/**
 * True when a PIN-lock record exists (T12c). A record that is not shaped like pin.ts writes it counts as no lock there; here it is still treated as a lock,
 * which is the safe direction (the plain key is not saved, so the next open asks for the 12 words). Never throws.
 */
async function hasPinLock(): Promise<boolean> {
  try {
    const saved = await getSessionRecord(PIN_RECORD);
    if (typeof saved !== 'object' || saved === null) return false;
    const record = saved as Record<string, unknown>;
    return (
      record.v === 1 &&
      typeof record.salt === 'string' &&
      typeof record.iterations === 'number' &&
      typeof record.wrapped === 'object' &&
      record.wrapped !== null
    );
  } catch {
    return false;
  }
}

/**
 * Saves the (non-extractable) key for later opens. A browser that cannot store a CryptoKey makes this return false, never throw.
 * RULE (T12b, T12c): under a PRF-level fingerprint lock or a PIN lock nothing is saved and the result is `true` (the next open uses the fingerprint or the PIN, not the 12 words).
 * A 12-word login therefore never brings the plain key back; the person can turn the lock off in Settings if the fingerprint or PIN is broken.
 */
async function persistKey(key: CryptoKey): Promise<boolean> {
  if ((await hasPrfLock()) || (await hasPinLock())) return true;
  try {
    await putSessionRecord(STORE_KEY_RECORD, key);
    return true;
  } catch {
    return false;
  }
}

function isStoreKey(value: unknown): value is CryptoKey {
  if (typeof value !== 'object' || value === null) return false;
  const key = value as Partial<CryptoKey>;
  return key.type === 'secret' && key.algorithm?.name === 'AES-GCM' && key.extractable === false;
}

/**
 * Register: makes the key for a NEW identity from the 12 words, saves a fresh key check (replacing any old one) and unlocks.
 * Call it only after the person confirmed that they saved the words.
 */
export async function createIdentity(words: string): Promise<CreateResult> {
  const checked = checkMnemonic(words);
  if (!checked.ok) return invalidWords(checked);

  const key = await deriveKey(checked.words, 'store');
  await writeCheck(key);
  setStoreKey(key);
  await rememberEnrolKey(checked.words);
  // A NEW identity: whatever was saved for an older one (plain key, fingerprint lock) no longer fits. Start clean, then save the new key.
  try {
    await clearSessionRecords();
  } catch {
    // the saved records stay; hasPrfLock() then keeps the old PRF lock from bringing back a plain key
  }
  const persisted = await persistKey(key);
  wire.emit('identity:unlocked', {});
  return { status: 'ok', persisted };
}

/**
 * Login with the 12 words (new device, cleared browser, or after Log out).
 * - invalid words: `invalid_words` with a reason code;
 * - a device that has a key check: the words must open it, otherwise `wrong_key` (nothing changes);
 * - a device with NO key check (fresh device): any valid words are accepted and the check is created
 *   (the person's data comes back later through the P12 backup file).
 */
export async function unlock(words: string): Promise<UnlockResult> {
  const checked = checkMnemonic(words);
  if (!checked.ok) return invalidWords(checked);

  const key = await deriveKey(checked.words, 'store');
  const state = await compareWithCheck(key);
  if (state === 'mismatch') return { status: 'wrong_key' };
  if (state === 'no_check') await writeCheck(key);

  setStoreKey(key);
  await rememberEnrolKey(checked.words);
  const persisted = await persistKey(key);
  wire.emit('identity:unlocked', {});
  return { status: 'ok', persisted };
}

/**
 * Normal app open (Q16): brings back the saved key without asking for the 12 words.
 * The key is accepted only if it still opens the key check; otherwise the saved key is thrown away.
 * Never throws: any storage problem simply means `none` and the Login screen is shown.
 * (When the fingerprint lock is on, the caller must pass the fingerprint check before calling this; see T12a/T12b.)
 */
export async function restoreSession(): Promise<RestoreResult> {
  if (isUnlocked()) return 'restored';
  try {
    const saved = await getSessionRecord(STORE_KEY_RECORD);
    if (!isStoreKey(saved)) return 'none';
    if ((await compareWithCheck(saved)) === 'match') {
      setStoreKey(saved);
      wire.emit('identity:unlocked', {});
      return 'restored';
    }
    await deleteSessionRecord(STORE_KEY_RECORD);
    return 'none';
  } catch {
    return 'none';
  }
}

/** Forgets the key in memory only. The saved key stays, so the next `restoreSession()` can bring it back. */
export function lock(): void {
  forgetKeyInMemory();
}

/**
 * Explicit Log out: forgets the key in memory AND removes everything saved in the session database
 * (the saved key, later the fingerprint-wrapped key and credential record). The encrypted data and the key check stay on the device,
 * so logging in again with the same 12 words opens the same data.
 */
export async function logOut(): Promise<void> {
  forgetKeyInMemory();
  await clearSessionRecords();
}

function forgetKeyInMemory(): void {
  const wasUnlocked = isUnlocked();
  clearStoreKey();
  if (wasUnlocked) wire.emit('identity:locked', {});
}
