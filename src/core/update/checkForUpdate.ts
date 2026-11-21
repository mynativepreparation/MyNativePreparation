// "Update app" check (P09, SPEC C7). Framework-free: the service worker registration and the online flag are passed in, so the
// logic is tested with fakes. The real registration comes from UpdateRegistrar (one registration for the whole app).

/** What the check needs from a service worker (a real `ServiceWorker` fits). */
export interface UpdateWorker {
  readonly state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
}

/** What the check needs from a registration (a real `ServiceWorkerRegistration` fits). */
export interface UpdateRegistration {
  readonly installing: UpdateWorker | null;
  readonly waiting: UpdateWorker | null;
  update(): Promise<unknown>;
}

/**
 * unsupported: no service worker (dev server, or a browser without one), so there is nothing to check.
 * offline:     the device is offline and no new version is waiting.
 * available:   a new version is installed and waiting; apply it with `apply()` from the update store.
 * latest:      the check finished and there is no newer version.
 * error:       the check failed or took longer than the time limit.
 */
export type UpdateCheckResult = 'unsupported' | 'offline' | 'available' | 'latest' | 'error';

export interface UpdateCheckInput {
  registration: UpdateRegistration | undefined;
  isOnline: () => boolean;
  /** True when the app was already told that a new version is waiting (workbox `onNeedRefresh`). */
  needRefresh?: boolean;
  /** The whole check (network and installing) must finish within this time. Default 10 seconds. */
  timeoutMs?: number;
}

export const UPDATE_CHECK_TIMEOUT_MS = 10_000;

/**
 * Asks the browser for a newer service worker and says what it found. Never throws.
 * A version that is already waiting counts as "available" even offline (it is already on the device).
 */
export async function checkForUpdate(input: UpdateCheckInput): Promise<UpdateCheckResult> {
  const { registration, isOnline, needRefresh = false, timeoutMs = UPDATE_CHECK_TIMEOUT_MS } = input;
  if (!registration) return 'unsupported';
  if (needRefresh || registration.waiting) return 'available';
  if (!isOnline()) return 'offline';

  const cleanups: Array<() => void> = [];
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<UpdateCheckResult>((resolve) => {
    timer = setTimeout(() => resolve('error'), timeoutMs);
  });

  const look = async (): Promise<UpdateCheckResult> => {
    await registration.update();
    // The check was already given up (time limit): do not start listening to anything.
    if (finished) return 'error';
    if (registration.waiting) return 'available';
    const worker = registration.installing;
    if (!worker) return 'latest';
    // A newer version was found and is installing: wait until it is installed (or fails).
    return new Promise<UpdateCheckResult>((resolve) => {
      const settle = () => {
        if (worker.state === 'redundant') resolve('error');
        else if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') resolve('available');
      };
      worker.addEventListener('statechange', settle);
      cleanups.push(() => worker.removeEventListener('statechange', settle));
      settle();
    });
  };

  try {
    return await Promise.race([look(), timeout]);
  } catch {
    return 'error';
  } finally {
    finished = true;
    if (timer !== undefined) clearTimeout(timer);
    cleanups.forEach((cleanup) => cleanup());
  }
}
