import { getFingerprintState } from './biometric';
import { decryptJson, DecryptError, encryptJson, fromBase64Url, toBase64Url, type Envelope } from './cipher';
import { clearEnrolKey, getEnrolKey, getStoreKey, isUnlocked } from './keyring';
import { adoptKey, PIN_RECORD, STORE_KEY_RECORD } from './session';
import { deleteSessionRecord, getSessionRecord, putSessionRecord } from '../storage/sessionStore';

// PIN lock (P04 T12c, owner request 2026-11-18): an app lock for devices that have no fingerprint reader (for example a laptop without Windows Hello), or a backup next to the fingerprint.
// Fingerprint and PIN may both be on (T12d): a good fingerprint opens the app, otherwise the PIN does. The 12 words always unlock, whatever happens to the PIN.
//
// How it works (honest version, see the P04 Design section):
//  - The store key is exported once (only while the 12 words were typed in this page session, the "enrolment key"), encrypted (AES-GCM) with a key
//    made from the PIN (PBKDF2-SHA-256, random salt, 600 000 rounds), and that wrapped copy replaces the plain saved key. So an app open needs the PIN.
//  - A PIN has only 10^6 possibilities. Someone who COPIES the browser's data files can try them all offline; the slow key derivation only makes that
//    expensive, not impossible. The PIN stops casual access (someone using your open laptop or phone), the 12 words are the real key.
//  - Five wrong PINs in a row remove the PIN lock; the person then needs the 12 words once (the wrong-try counter is saved, so a page reload does not reset it).
// Nothing here ever holds, saves or logs the 12 words, and the PIN itself is never saved (only the wrapped key and a random salt).

export const PIN_LENGTH = 6;
export const MAX_PIN_TRIES = 5;
/** OWASP-style cost for PBKDF2-SHA-256. Tests pass a small number through `PinOptions`; the app always uses this one. */
export const PIN_ITERATIONS = 600_000;

const SALT_BYTES = 16;
/** Names the place of the wrapped key, like the row AADs elsewhere (`<table>:<key>`), so it cannot be swapped for another ciphertext. */
const PIN_AAD = 'session:pin';
const MAX_STORED_ITERATIONS = 5_000_000;

const encoder = new TextEncoder();

export type PinProblem = 'wrong_length' | 'not_digits' | 'too_easy';
export type PinCheck = { ok: true } | { ok: false; reason: PinProblem };

export interface PinOptions {
  /** PBKDF2 rounds. Default `PIN_ITERATIONS`; only tests change it. */
  iterations?: number;
  /** The extractable store key to wrap. Default: the enrolment key kept in memory after Register/Login. */
  storeKey?: CryptoKey | null;
}

interface PinRecord {
  v: 1;
  iterations: number;
  salt: string;
  wrapped: Envelope;
  /** Wrong PINs in a row. */
  fails: number;
}

export interface PinState {
  enabled: boolean;
  triesLeft: number;
}

export type EnablePinResult =
  | { status: 'ok' }
  | { status: 'invalid_pin'; problem: PinProblem }
  /** The 12 words were not typed in this page session, so there is no key to wrap: log in with them first. */
  | { status: 'needs_words' }
  | { status: 'failed' };

export type UnlockPinResult =
  | { status: 'ok' }
  /** Not 6 digits: no try is counted. */
  | { status: 'invalid_pin'; problem: 'wrong_length' | 'not_digits' }
  | { status: 'wrong_pin'; triesLeft: number }
  /** The fifth wrong PIN: the PIN lock was removed, the person needs the 12 words. */
  | { status: 'too_many_tries' }
  | { status: 'no_pin' }
  | { status: 'failed' };

export type DisablePinResult =
  | { status: 'ok'; /** False when the browser could not save the key; the next app open then asks for the 12 words. */ persisted: boolean }
  | { status: 'locked' }
  | { status: 'failed' };

/** True for 000000, 111111, 123456, 654321 and the like. */
function isEasy(pin: string): boolean {
  const digits = Array.from(pin, Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]);
  return steps.every((step) => step === 0) || steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

/** Rules for a NEW PIN: exactly 6 ASCII digits and not an obvious pattern. Never throws. */
export function checkPin(pin: string): PinCheck {
  if (!/^[0-9]*$/.test(pin)) return { ok: false, reason: 'not_digits' };
  if (pin.length !== PIN_LENGTH) return { ok: false, reason: 'wrong_length' };
  if (isEasy(pin)) return { ok: false, reason: 'too_easy' };
  return { ok: true };
}

function parseRecord(saved: unknown): PinRecord | null {
  if (typeof saved !== 'object' || saved === null) return null;
  const record = saved as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (typeof record.iterations !== 'number' || !Number.isInteger(record.iterations)) return null;
  if (record.iterations < 1 || record.iterations > MAX_STORED_ITERATIONS) return null;
  if (typeof record.salt !== 'string' || typeof record.fails !== 'number') return null;
  if (typeof record.wrapped !== 'object' || record.wrapped === null) return null;
  return { v: 1, iterations: record.iterations, salt: record.salt, wrapped: record.wrapped as Envelope, fails: record.fails };
}

/** A damaged or missing record counts as "no PIN lock". Never throws. */
async function readRecord(): Promise<PinRecord | null> {
  try {
    return parseRecord(await getSessionRecord(PIN_RECORD));
  } catch {
    return null;
  }
}

/** Whether the PIN lock is on and how many tries are left. Never throws. */
export async function getPinState(): Promise<PinState> {
  const record = await readRecord();
  if (record === null) return { enabled: false, triesLeft: MAX_PIN_TRIES };
  return { enabled: true, triesLeft: Math.max(0, MAX_PIN_TRIES - record.fails) };
}

async function derivePinKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await globalThis.crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts the raw bytes of the store key with a key made from the PIN. The raw bytes are overwritten with zeros afterwards (best effort). */
async function wrapStoreKey(storeKey: CryptoKey, pin: string, iterations: number): Promise<PinRecord> {
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', storeKey));
  try {
    const salt = new Uint8Array(SALT_BYTES);
    globalThis.crypto.getRandomValues(salt);
    const wrapped = await encryptJson(await derivePinKey(pin, salt, iterations), toBase64Url(raw), PIN_AAD);
    return { v: 1, iterations, salt: toBase64Url(salt), wrapped, fails: 0 };
  } finally {
    raw.fill(0);
  }
}

/** Turns the PIN into the store key again (non-extractable). A wrong PIN gives `wrong_pin`; a damaged record gives `damaged`. Never throws. */
async function openWrapped(record: PinRecord, pin: string): Promise<CryptoKey | 'wrong_pin' | 'damaged'> {
  try {
    const wrapKey = await derivePinKey(pin, fromBase64Url(record.salt), record.iterations);
    const text = await decryptJson<string>(wrapKey, record.wrapped, PIN_AAD);
    const raw = fromBase64Url(text);
    try {
      return await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } finally {
      raw.fill(0);
    }
  } catch (error) {
    return error instanceof DecryptError && error.reason === 'auth_failed' ? 'wrong_pin' : 'damaged';
  }
}

/**
 * Turns the PIN lock on: wraps the store key with the PIN, saves the wrapped copy, then deletes the plain saved key (so the PIN really guards the data).
 * Needs the enrolment key (the 12 words typed in this page session); without it the result is `needs_words`.
 * If anything fails the old state is kept as far as possible and the result is `failed`. The enrolment key is forgotten after success.
 */
export async function enablePin(pin: string, options: PinOptions = {}): Promise<EnablePinResult> {
  const checked = checkPin(pin);
  if (!checked.ok) return { status: 'invalid_pin', problem: checked.reason };
  const storeKey = options.storeKey ?? getEnrolKey();
  if (storeKey === null) return { status: 'needs_words' };

  try {
    // A gate-level fingerprint lock (T12d) opens the app through the plain saved key, so that key stays; in every other case it is removed so the PIN really guards the data.
    const fingerprint = await getFingerprintState();
    const keepPlainKey = fingerprint.enabled && fingerprint.level === 'gate';
    const record = await wrapStoreKey(storeKey, pin, options.iterations ?? PIN_ITERATIONS);
    await putSessionRecord(PIN_RECORD, record);
    if (!keepPlainKey) {
      try {
        await deleteSessionRecord(STORE_KEY_RECORD);
      } catch (error) {
        // The plain key is still saved, so the PIN would protect nothing: undo.
        await deleteSessionRecord(PIN_RECORD).catch(() => undefined);
        throw error;
      }
    }
    clearEnrolKey();
    return { status: 'ok' };
  } catch {
    return { status: 'failed' };
  }
}

async function registerWrongPin(record: PinRecord): Promise<UnlockPinResult> {
  const fails = record.fails + 1;
  try {
    if (fails >= MAX_PIN_TRIES) {
      await deleteSessionRecord(PIN_RECORD);
      return { status: 'too_many_tries' };
    }
    await putSessionRecord(PIN_RECORD, { ...record, fails });
  } catch {
    // the counter could not be saved: the answer is still "wrong PIN"
  }
  return { status: 'wrong_pin', triesLeft: Math.max(0, MAX_PIN_TRIES - fails) };
}

/**
 * App open with the PIN lock on: a good PIN makes the store key the unlocked key, but only if it opens the key check (same rule as the fingerprint unlock).
 * A PIN that is not 6 digits is `invalid_pin` and costs no try. Never throws.
 */
export async function unlockWithPin(pin: string): Promise<UnlockPinResult> {
  const shape = checkPin(pin);
  if (!shape.ok && shape.reason !== 'too_easy') return { status: 'invalid_pin', problem: shape.reason };

  const record = await readRecord();
  if (record === null) return { status: 'no_pin' };

  const opened = await openWrapped(record, pin);
  if (opened === 'wrong_pin') return registerWrongPin(record);
  if (opened === 'damaged') return { status: 'failed' };

  const adopted = await adoptKey(opened).catch(() => false);
  if (!adopted) return { status: 'failed' };
  if (record.fails > 0) await putSessionRecord(PIN_RECORD, { ...record, fails: 0 }).catch(() => undefined);
  return { status: 'ok' };
}

/**
 * Turns the PIN lock off (Settings). Needs the unlocked app: the plain key is saved again FIRST (so the next open does not ask for the 12 words, Q16),
 * then the PIN record is removed. If the record cannot be removed, the plain key is removed again and the result is `failed`.
 */
export async function disablePin(): Promise<DisablePinResult> {
  if (!isUnlocked()) return { status: 'locked' };
  let persisted = true;
  // A PRF-level fingerprint lock that stays on (T12d) must keep the plain key away; the gate level opens the app through it, so it comes back.
  const fingerprint = await getFingerprintState();
  if (!(fingerprint.enabled && fingerprint.level === 'prf')) {
    try {
      await putSessionRecord(STORE_KEY_RECORD, getStoreKey());
    } catch {
      persisted = false; // this browser cannot save a key: the next open asks for the 12 words
    }
  }
  try {
    await deleteSessionRecord(PIN_RECORD);
  } catch {
    await deleteSessionRecord(STORE_KEY_RECORD).catch(() => undefined);
    return { status: 'failed' };
  }
  return { status: 'ok', persisted };
}
