// The in-memory home of the unlocked store key, kept in its own tiny file with NO imports.
// Why separate: session.ts reads and writes the key check through the repository, and (from P04 T5) the repository
// needs the key to encrypt rows. If both lived in one file they would import each other in a circle.
// repo.ts imports this file; session.ts imports repo.ts. Nothing here ever holds the 12 words.

/** Thrown when something needs the store key while nobody is logged in. The message is fixed text. */
export class LockedError extends Error {
  constructor() {
    super('The app is locked: log in first');
    this.name = 'LockedError';
  }
}

let storeKey: CryptoKey | null = null;
// The enrolment key (P04 T12b): an EXTRACTABLE copy of the store key, made while the 12 words were in memory (right after Register or Login).
// The fingerprint lock needs it once to wrap the key (enableFingerprint). Memory only, never saved; it is forgotten after use, on Skip and on Log out.
let enrolKey: CryptoKey | null = null;

/** Remembers the unlocked store key for this page session (memory only). */
export function setStoreKey(key: CryptoKey): void {
  storeKey = key;
}

/** Forgets the key in memory. It does not touch anything saved on the device. Also forgets the enrolment key. */
export function clearStoreKey(): void {
  storeKey = null;
  enrolKey = null;
}

export function setEnrolKey(key: CryptoKey): void {
  enrolKey = key;
}

/** The extractable copy, or null when the 12 words were not typed in this page session (then the person must log in with them first). */
export function getEnrolKey(): CryptoKey | null {
  return enrolKey;
}

export function clearEnrolKey(): void {
  enrolKey = null;
}

export function isUnlocked(): boolean {
  return storeKey !== null;
}

/** The key that encrypts the local database. Throws `LockedError` while locked. */
export function getStoreKey(): CryptoKey {
  if (storeKey === null) throw new LockedError();
  return storeKey;
}
