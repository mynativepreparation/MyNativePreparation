// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './cipher';
import { generateMnemonic12 } from './mnemonic';
import { clearEnrolKey, createIdentity, getEnrolKey, getStoreKey, logOut, unlock } from './session';

// The enrolment key (P04 T12b) is an extractable copy of the store key kept in memory only, so the fingerprint offer
// right after Register/Login can wrap it. It must exist only after the 12 words were typed, and never survive Log out.
describe('enrolment key', () => {
  beforeEach(async () => {
    await logOut();
  });

  it('is empty before anybody registered or logged in', () => {
    expect(getEnrolKey()).toBeNull();
  });

  it('Register makes an extractable copy that is the same key as the store key', async () => {
    expect((await createIdentity(generateMnemonic12())).status).toBe('ok');
    const enrol = getEnrolKey();
    expect(enrol).not.toBeNull();
    expect(enrol?.extractable).toBe(true);
    expect(getStoreKey().extractable).toBe(false);
    const envelope = await encryptJson(enrol as CryptoKey, 'hello', 'test:1');
    expect(await decryptJson<string>(getStoreKey(), envelope, 'test:1')).toBe('hello');
  });

  it('clearEnrolKey forgets it and Log out forgets it too', async () => {
    await createIdentity(generateMnemonic12());
    clearEnrolKey();
    expect(getEnrolKey()).toBeNull();
    await createIdentity(generateMnemonic12());
    expect(getEnrolKey()).not.toBeNull();
    await logOut();
    expect(getEnrolKey()).toBeNull();
  });

  it('a correct 12-word login makes it again, a wrong key does not', async () => {
    const words = generateMnemonic12();
    await createIdentity(words);
    await logOut();
    expect((await unlock(generateMnemonic12())).status).toBe('wrong_key');
    expect(getEnrolKey()).toBeNull();
    expect((await unlock(words)).status).toBe('ok');
    expect(getEnrolKey()?.extractable).toBe(true);
  });
});
