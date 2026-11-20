import { getSetting, setSetting } from '../storage/repo';
import { wire } from '../wire/wire';
import { getFingerprintState, unlockWithFingerprint, type PlatformAuth } from './biometric';
import { getPinState } from './pin';
import { isUnlocked, restoreSession } from './session';

// Where a person may be, depending on whether they are logged in and finished onboarding (P04 T6, DECISIONS Q16).
// `decideRoute` is pure so it can be tested without a browser; the app's route guard (src/app/IdentityGate.tsx) only calls it.

export const AUTH_ROUTES = {
  welcome: '/welcome',
  register: '/register',
  login: '/login',
  fingerprint: '/fingerprint',
  /** PIN lock (T12c): the front door of an app that is locked with a PIN. */
  pin: '/pin',
  /** PIN offer right after Register (onboarding). */
  pinSetup: '/pin-setup',
  info: '/info',
  privacy: '/privacy',
  home: '/',
} as const;

const ONBOARDED_SETTING = 'identity.onboarded';

export interface IdentityStatus {
  /** The store key is in memory (logged in, or restored on app open). */
  unlocked: boolean;
  /** The person finished onboarding once on this device (or logged in as a returning user). */
  onboarded: boolean;
  /** Only present (true) when the store key is NOT in memory and a PIN lock is on: the person must enter the PIN (or use the 12 words). */
  pinLocked?: boolean;
}

/** Screens for people who are NOT logged in. */
const LOGGED_OUT_PATHS: readonly string[] = [AUTH_ROUTES.welcome, AUTH_ROUTES.register, AUTH_ROUTES.login];
/** Screens that only make sense right after Register. */
const ONBOARDING_PATHS: readonly string[] = [AUTH_ROUTES.fingerprint, AUTH_ROUTES.pinSetup, AUTH_ROUTES.info, AUTH_ROUTES.privacy];

/**
 * Where to send the person for the screen they asked for, or `null` when they may stay.
 * - not logged in: only Welcome, Register and Login; everything else goes to Login (returning user) or Welcome (first run);
 *   with a PIN lock on (`pinLocked`) everything else goes to the PIN screen instead, and the PIN screen is the only other place that may stay;
 * - logged in but onboarding not finished: Register/Login (they are finishing a step), Fingerprint, PIN offer, Info and Privacy may stay; everything else goes to Info;
 * - logged in and onboarded: the app; the Welcome/Register/Login/Fingerprint/PIN/Info/Privacy screens go to Home.
 */
export function decideRoute(status: IdentityStatus, pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (!status.unlocked) {
    if (LOGGED_OUT_PATHS.includes(path)) return null;
    if (status.pinLocked === true) return path === AUTH_ROUTES.pin ? null : AUTH_ROUTES.pin;
    return status.onboarded ? AUTH_ROUTES.login : AUTH_ROUTES.welcome;
  }
  if (!status.onboarded) {
    if (LOGGED_OUT_PATHS.includes(path) || ONBOARDING_PATHS.includes(path)) return null;
    return AUTH_ROUTES.info;
  }
  if (LOGGED_OUT_PATHS.includes(path) || ONBOARDING_PATHS.includes(path) || path === AUTH_ROUTES.pin) return AUTH_ROUTES.home;
  return null;
}

async function readIdentityStatus(auth: PlatformAuth | undefined): Promise<IdentityStatus> {
  try {
    const onboarded = (await getSetting<boolean>(ONBOARDED_SETTING)) === true;
    const lock = await getFingerprintState();
    if (lock.enabled) {
      // Fingerprint lock on (T12b): the prompt comes FIRST at both levels. Cancel or failure just means "locked" -> Login,
      // where the 12 words always work (never an error screen).
      const opened = await unlockWithFingerprint(auth);
      if (opened.status === 'ok') return { unlocked: true, onboarded };
      // BOTH locks on (T12d, owner decision 2026-11-19): a good fingerprint opens the app, no PIN. Without the fingerprint (cancelled or failed)
      // the PIN screen is the way in, and the 12 words still work from there.
      if (!isUnlocked() && (await getPinState()).enabled) return { unlocked: false, onboarded, pinLocked: true };
      return { unlocked: false, onboarded };
    }
    // PIN lock on (T12c): the saved plain key is gone, so there is nothing to restore; the PIN screen is shown. (A key already in memory needs no PIN.)
    if (!isUnlocked() && (await getPinState()).enabled) return { unlocked: false, onboarded, pinLocked: true };
    const restored = await restoreSession();
    return { unlocked: restored === 'restored', onboarded };
  } catch {
    return { unlocked: false, onboarded: false };
  }
}

/** One read at a time: two callers at once (e.g. React strict mode in development) share ONE fingerprint prompt. */
let loading: Promise<IdentityStatus> | null = null;

/**
 * Reads the state at app open. With the fingerprint lock on it shows the fingerprint prompt first; otherwise it restores the saved login
 * without any prompt (no 12 words needed, Q16). `auth` is for tests only (a fake phone). Never throws.
 */
export async function loadIdentityStatus(auth?: PlatformAuth): Promise<IdentityStatus> {
  loading ??= readIdentityStatus(auth).finally(() => {
    loading = null;
  });
  return loading;
}

/** True when onboarding was finished once on this device (so old encrypted data may be here). Never throws. */
export async function isOnboarded(): Promise<boolean> {
  try {
    return (await getSetting<boolean>(ONBOARDED_SETTING)) === true;
  } catch {
    return false;
  }
}

/** Remembers that onboarding is finished on this device and tells the app. */
export async function markOnboarded(): Promise<void> {
  await setSetting(ONBOARDED_SETTING, true);
  wire.emit('identity:onboarded', {});
}
