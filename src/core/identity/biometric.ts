import { decryptJson, encryptJson, fromBase64Url, toBase64Url, type Envelope } from './cipher';
import { getStoreKey, isUnlocked } from './keyring';
import { adoptKey, FINGERPRINT_RECORD, opensKeyCheck, PIN_RECORD, restoreSession, STORE_KEY_RECORD } from './session';
import { deleteSessionRecord, getSessionRecord, putSessionRecord } from '../storage/sessionStore';

// Optional fingerprint lock (P04 plan, DECISIONS Q16 and "Verified facts: WebAuthn prf usage").
// The phone/PC checks the fingerprint, face or screen lock itself (WebAuthn, platform authenticator); the app never sees biometric data.
// Two honest levels, decided at enrolment time:
//  - 'prf'  : the authenticator also gives a secret (PRF extension). A copy of the store key is wrapped with a key made from that secret
//             and the plain saved key is deleted, so opening the app REALLY needs the fingerprint.
//  - 'gate' : no PRF. The fingerprint only guards the app opening; the plain saved key stays. The UI must say "protects the app screen, not the files".
// The 12 words ALWAYS unlock, whatever happens here. Nothing in this file ever holds the 12 words.

/** Everything that can talk to the phone's fingerprint/face/screen-lock. Tests use a fake; the real prompt is checked in the owner's browser (T13). */
export type AuthFailureStatus = 'cancelled' | 'unsupported' | 'failed';

export type AuthOutcome<T> = { status: 'ok'; value: T } | { status: AuthFailureStatus };

export interface EnrollInfo {
  credentialId: Uint8Array<ArrayBuffer>;
  /** True only if the authenticator said it can do PRF (`getClientExtensionResults().prf.enabled`). */
  prfSupported: boolean;
}

export interface VerifyInfo {
  /** The 32 secret bytes when a salt was given and the authenticator produced them, otherwise null. */
  prf: Uint8Array<ArrayBuffer> | null;
}

export interface PlatformAuth {
  /** Is a fingerprint/face/screen-lock authenticator usable here (secure context, platform authenticator)? */
  isAvailable(): Promise<boolean>;
  /** Best-effort hint BEFORE enrolling. Only `enroll()` knows the truth, so never rely on this alone. */
  supportsPrf(): Promise<boolean>;
  /** Creates a device credential. This already shows the fingerprint prompt. */
  enroll(): Promise<AuthOutcome<EnrollInfo>>;
  /** Shows the fingerprint prompt for an existing credential. With `prfSalt` it also asks for the PRF secret. */
  verify(credentialId: Uint8Array<ArrayBuffer>, prfSalt?: Uint8Array<ArrayBuffer>): Promise<AuthOutcome<VerifyInfo>>;
}

export type FingerprintLevel = 'prf' | 'gate';

/** Fixed codes for "failed" (never contain keys, words or data). */
export type FailReason =
  | 'locked' // nobody is logged in
  | 'not_extractable' // enableFingerprint needs the extractable store key made while the 12 words were in memory
  | 'wrong_key' // that key does not open the data on this device
  | 'not_enabled' // no (valid) fingerprint record
  | 'authenticator' // the prompt failed for a reason other than cancel / unsupported
  | 'no_prf_output' // PRF level, but the authenticator gave no (or a wrong-sized) secret
  | 'unwrap_failed' // the secret did not open the wrapped key (new phone, reset lock, changed web address, damaged data)
  | 'no_saved_key' // gate level, but the saved key is missing
  | 'storage'; // the browser could not save or remove the record

export type FingerprintFailure = { status: 'cancelled' } | { status: 'unsupported' } | { status: 'failed'; reason: FailReason };

/** Cancelling is a normal answer, never an error screen. */
export type FingerprintResult<T extends object = object> = ({ status: 'ok' } & T) | FingerprintFailure;

export type FingerprintState = { enabled: false } | { enabled: true; level: FingerprintLevel };

// FINGERPRINT_RECORD (the session-database record that says the lock is on; removed by disableFingerprint(), Log out and a new Register)
// is defined in session.ts, so session.ts can read it without importing this file.
const WRAPPED_AAD = 'session:fingerprint-key';

/**
 * FROZEN (like the kdf constants): changing these makes every existing fingerprint lock unusable until the person logs in with the 12 words
 * and turns it on again. Same site address + same credential + same salt = same 32 PRF bytes.
 */
const PRF_SALT = 'np/prf/v1';
const WRAP_SALT = 'np/prf-wrap-salt/v1';
const WRAP_INFO = 'np/prf-wrap/v1';
const PRF_BYTES = 32;
/** An AES-256 key is 32 bytes (the same number as PRF_BYTES by chance, not by rule). */
const STORE_KEY_BYTES = 32;

const APP_NAME = 'My Native Preparation';

interface FingerprintRecord {
  v: 1;
  level: FingerprintLevel;
  /** base64url of the WebAuthn credential id (not secret). */
  credentialId: string;
  /** Only for level 'prf': the store key wrapped with the PRF-derived key. */
  wrapped?: Envelope;
}

const encoder = new TextEncoder();

function textBytes(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(text));
}

function fail(reason: FailReason): { status: 'failed'; reason: FailReason } {
  return { status: 'failed', reason };
}

/** Turns a non-ok prompt answer into the matching result. */
function relay(status: AuthFailureStatus): FingerprintFailure {
  if (status === 'cancelled') return { status: 'cancelled' };
  if (status === 'unsupported') return { status: 'unsupported' };
  return fail('authenticator');
}

function isValidPrf(prf: Uint8Array | null): prf is Uint8Array<ArrayBuffer> {
  return prf !== null && prf.length === PRF_BYTES;
}

function isRecord(value: unknown): value is FingerprintRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.credentialId !== 'string') return false;
  if (record.level === 'gate') return true;
  return record.level === 'prf' && typeof record.wrapped === 'object' && record.wrapped !== null;
}

async function readRecord(): Promise<FingerprintRecord | null> {
  try {
    const saved = await getSessionRecord(FINGERPRINT_RECORD);
    return isRecord(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * True while a PIN lock exists (T12d). Then the plain saved key must stay away, whatever the fingerprint does.
 * Read directly from the session record because pin.ts imports this file. Never throws (an unreadable record counts as "no PIN lock").
 */
async function pinLockExists(): Promise<boolean> {
  try {
    const saved = await getSessionRecord(PIN_RECORD);
    return typeof saved === 'object' && saved !== null;
  } catch {
    return false;
  }
}

/** Is the fingerprint lock on, and at which level? Never throws (a damaged record counts as "off"). */
export async function getFingerprintState(): Promise<FingerprintState> {
  const record = await readRecord();
  return record === null ? { enabled: false } : { enabled: true, level: record.level };
}

/** PRF secret -> AES-GCM key that wraps the store key. Used only for that; the PRF bytes are never used directly as a key. */
async function deriveWrapKey(prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await globalThis.crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: textBytes(WRAP_SALT), info: textBytes(WRAP_INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Wraps the raw store key bytes. The raw copy is overwritten with zeros afterwards (best effort). */
async function wrapStoreKey(storeKey: CryptoKey, prf: Uint8Array<ArrayBuffer>): Promise<Envelope> {
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', storeKey));
  try {
    const wrapKey = await deriveWrapKey(prf);
    return await encryptJson(wrapKey, toBase64Url(raw), WRAPPED_AAD);
  } finally {
    raw.fill(0);
  }
}

/** Reverses `wrapStoreKey`. A wrong secret or damaged data gives null (never throws, never a partial key). The result is non-extractable. */
async function unwrapStoreKey(wrapped: Envelope, prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey | null> {
  const wrapKey = await deriveWrapKey(prf);
  let text: unknown;
  try {
    text = await decryptJson(wrapKey, wrapped, WRAPPED_AAD);
  } catch {
    return null;
  }
  if (typeof text !== 'string') return null;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64Url(text);
  } catch {
    return null;
  }
  try {
    if (raw.length !== STORE_KEY_BYTES) return null;
    return await globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

/**
 * Turns the fingerprint lock on. `storeKey` must be the EXTRACTABLE copy of the store key made with
 * `deriveKey(words, 'store', { extractable: true })` while the 12 words are in memory (right after Register or Login, or after the person
 * typed the words again in Settings); it is only read here and never saved as it is. The person must be unlocked already.
 * Result: `ok` + the level the device really got; `cancelled` (nothing changes); `unsupported`; or `failed` with a reason code.
 * If the authenticator says it can do PRF but then gives no secret, the lock is turned on at 'gate' level and the result says so.
 */
export async function enableFingerprint(
  storeKey: CryptoKey,
  auth: PlatformAuth = browserPlatformAuth,
): Promise<FingerprintResult<{ level: FingerprintLevel }>> {
  if (!storeKey.extractable) return fail('not_extractable');
  if (!isUnlocked()) return fail('locked');
  if (!(await opensKeyCheck(storeKey))) return fail('wrong_key');
  if (!(await auth.isAvailable())) return { status: 'unsupported' };

  const enrolled = await auth.enroll();
  if (enrolled.status !== 'ok') return relay(enrolled.status);
  const { credentialId, prfSupported } = enrolled.value;

  let wrapped: Envelope | undefined;
  if (prfSupported) {
    // Evaluating the PRF while creating is not possible on every authenticator, so we always ask once more (a second prompt).
    const asked = await auth.verify(credentialId, textBytes(PRF_SALT));
    if (asked.status === 'cancelled' || asked.status === 'unsupported') return { status: asked.status };
    if (asked.status === 'ok' && isValidPrf(asked.value.prf)) {
      try {
        wrapped = await wrapStoreKey(storeKey, asked.value.prf);
      } catch {
        return fail('storage');
      } finally {
        asked.value.prf.fill(0);
      }
    }
    // A failed prompt or a missing secret falls through to the gate level; the result tells the truth.
  }

  const id = toBase64Url(credentialId);
  const record: FingerprintRecord =
    wrapped === undefined ? { v: 1, level: 'gate', credentialId: id } : { v: 1, level: 'prf', credentialId: id, wrapped };

  try {
    await putSessionRecord(FINGERPRINT_RECORD, record);
    if (record.level === 'prf') {
      // The plain saved key must go, otherwise the fingerprint would protect nothing.
      await deleteSessionRecord(STORE_KEY_RECORD);
    } else {
      // The gate level opens the app through the plain saved key, so it must exist. This holds with a PIN lock on too (T12d): a good fingerprint opens the app without the PIN.
      await putSessionRecord(STORE_KEY_RECORD, getStoreKey());
    }
  } catch {
    try {
      await deleteSessionRecord(FINGERPRINT_RECORD);
    } catch {
      // nothing more we can do; the 12 words still work
    }
    return fail('storage');
  }
  return { status: 'ok', level: record.level };
}

/**
 * Normal app open with the fingerprint lock on: shows the fingerprint prompt, then unlocks.
 * - 'prf' level: the secret must open the wrapped key, and that key must open the key check; a wrong or missing secret never gives a key.
 * - 'gate' level: after the prompt the saved key is restored (restoreSession).
 * The 12 words (`unlock`) work whatever this returns.
 */
export async function unlockWithFingerprint(auth: PlatformAuth = browserPlatformAuth): Promise<FingerprintResult> {
  const record = await readRecord();
  if (record === null) return fail('not_enabled');
  if (isUnlocked()) return { status: 'ok' };

  let credentialId: Uint8Array<ArrayBuffer>;
  try {
    credentialId = fromBase64Url(record.credentialId);
  } catch {
    return fail('not_enabled');
  }

  const asked = await auth.verify(credentialId, record.level === 'prf' ? textBytes(PRF_SALT) : undefined);
  if (asked.status !== 'ok') return relay(asked.status);

  if (record.level === 'gate') {
    return (await restoreSession()) === 'restored' ? { status: 'ok' } : fail('no_saved_key');
  }

  const prf = asked.value.prf;
  if (!isValidPrf(prf) || record.wrapped === undefined) return fail('no_prf_output');
  try {
    const key = await unwrapStoreKey(record.wrapped, prf);
    if (key === null) return fail('unwrap_failed');
    return (await adoptKey(key)) ? { status: 'ok' } : fail('wrong_key');
  } catch {
    return fail('unwrap_failed');
  } finally {
    prf.fill(0);
  }
}

/**
 * Turns the fingerprint lock off: removes the wrapped key and the credential record.
 * If the person is unlocked, the plain saved key is put back first, so a normal open works without the fingerprint (the PRF level had removed it).
 * If the person is locked, nobody has proved anything, so the plain saved key is removed too (otherwise the gate level would open the app
 * without the fingerprint) and the next open asks for the 12 words. The passkey itself stays in the phone's own list (a website cannot delete it).
 */
export async function disableFingerprint(): Promise<FingerprintResult> {
  if (isUnlocked() && !(await pinLockExists())) {
    try {
      await putSessionRecord(STORE_KEY_RECORD, getStoreKey());
    } catch {
      // the browser cannot save the key: the 12 words are asked next time, which is safe
    }
  } else {
    // Locked, or a PIN lock stays on (T12d): the plain saved key must be gone, otherwise the PIN would protect nothing once the fingerprint is off.
    try {
      await deleteSessionRecord(STORE_KEY_RECORD);
    } catch {
      return fail('storage'); // keep the fingerprint record: removing it now could leave the app open without the fingerprint
    }
  }
  try {
    await deleteSessionRecord(FINGERPRINT_RECORD);
  } catch {
    return fail('storage');
  }
  return { status: 'ok' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Real browser implementation (WebAuthn). It cannot run in unit tests; the owner's browser check (T13) covers it.

interface PrfClientResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } };
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function webAuthnReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== 'undefined' &&
    'credentials' in navigator
  );
}

/** WebAuthn reports "user cancelled" and "timed out" both as NotAllowedError; both are a normal "not now". */
function statusOf(error: unknown): AuthFailureStatus {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'unsupported';
  return 'failed';
}

function prfRequest(salt?: Uint8Array<ArrayBuffer>): AuthenticationExtensionsClientInputs {
  // Cast through unknown: older TypeScript DOM typings do not know the `prf` extension yet.
  const request = salt === undefined ? { prf: {} } : { prf: { eval: { first: salt } } };
  return request as unknown as AuthenticationExtensionsClientInputs;
}

function prfBytesFrom(results: PrfClientResults): Uint8Array<ArrayBuffer> | null {
  const first = results.prf?.results?.first;
  if (first instanceof ArrayBuffer) return Uint8Array.from(new Uint8Array(first));
  if (ArrayBuffer.isView(first)) return Uint8Array.from(new Uint8Array(first.buffer, first.byteOffset, first.byteLength));
  return null;
}

export const browserPlatformAuth: PlatformAuth = {
  async isAvailable() {
    if (!webAuthnReady()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  async supportsPrf() {
    if (!webAuthnReady()) return false;
    try {
      const api = PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> };
      if (typeof api.getClientCapabilities !== 'function') return false;
      const capabilities = await api.getClientCapabilities.call(PublicKeyCredential);
      return capabilities['extension:prf'] === true;
    } catch {
      return false;
    }
  },

  async enroll() {
    if (!webAuthnReady()) return { status: 'unsupported' };
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          rp: { name: APP_NAME },
          // Random id and a fixed label: no personal data goes into the phone's passkey list.
          user: { id: randomBytes(16), name: APP_NAME, displayName: APP_NAME },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          attestation: 'none',
          timeout: 60_000,
          extensions: prfRequest(),
        },
      });
      if (!(credential instanceof PublicKeyCredential)) return { status: 'failed' };
      const results = credential.getClientExtensionResults() as unknown as PrfClientResults;
      return {
        status: 'ok',
        value: { credentialId: new Uint8Array(credential.rawId), prfSupported: results.prf?.enabled === true },
      };
    } catch (error) {
      return { status: statusOf(error) };
    }
  },

  async verify(credentialId, prfSalt) {
    if (!webAuthnReady()) return { status: 'unsupported' };
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [{ type: 'public-key', id: credentialId }],
          userVerification: 'required',
          timeout: 60_000,
          ...(prfSalt === undefined ? {} : { extensions: prfRequest(prfSalt) }),
        },
      });
      if (!(assertion instanceof PublicKeyCredential)) return { status: 'failed' };
      const results = assertion.getClientExtensionResults() as unknown as PrfClientResults;
      return { status: 'ok', value: { prf: prfBytesFrom(results) } };
    } catch (error) {
      return { status: statusOf(error) };
    }
  },
};
