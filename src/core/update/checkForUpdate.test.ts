import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { checkForUpdate, UPDATE_CHECK_TIMEOUT_MS, type UpdateWorker } from './checkForUpdate';

// P09 T1: the "Update app" check with a fake registration and fake timers (no browser, no network).

function makeWorker(initialState: string) {
  const listeners = new Set<() => void>();
  return {
    state: initialState,
    addEventListener: (_type: 'statechange', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'statechange', listener: () => void) => {
      listeners.delete(listener);
    },
    // test helpers
    moveTo(next: string) {
      this.state = next;
      [...listeners].forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}

interface FakeRegistration {
  installing: UpdateWorker | null;
  waiting: UpdateWorker | null;
  update: Mock<() => Promise<unknown>>;
}

function makeRegistration(): FakeRegistration {
  return { installing: null, waiting: null, update: vi.fn<() => Promise<unknown>>(() => Promise.resolve()) };
}

const online = () => true;
const offline = () => false;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkForUpdate', () => {
  it('no service worker (dev server, unsupported browser): "unsupported"', async () => {
    await expect(checkForUpdate({ registration: undefined, isOnline: online })).resolves.toBe('unsupported');
  });

  it('a version that is already waiting: "available", even offline, and the network is not asked', async () => {
    const registration = makeRegistration();
    registration.waiting = makeWorker('installed');
    await expect(checkForUpdate({ registration, isOnline: offline })).resolves.toBe('available');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('the app was already told that a version is waiting: "available"', async () => {
    const registration = makeRegistration();
    await expect(checkForUpdate({ registration, isOnline: online, needRefresh: true })).resolves.toBe('available');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('offline and nothing waiting: "offline", and the network is not asked', async () => {
    const registration = makeRegistration();
    await expect(checkForUpdate({ registration, isOnline: offline })).resolves.toBe('offline');
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('the browser finds nothing newer: "latest"', async () => {
    const registration = makeRegistration();
    await expect(checkForUpdate({ registration, isOnline: online })).resolves.toBe('latest');
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('a newer version is found and installs: "available", and the listener is removed afterwards', async () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    registration.update.mockImplementation(() => {
      registration.installing = worker;
      return Promise.resolve();
    });
    const result = checkForUpdate({ registration, isOnline: online });
    await vi.advanceTimersByTimeAsync(0); // update() resolved, the check is now waiting for the install
    expect(worker.listenerCount()).toBe(1);
    worker.moveTo('installed');
    await expect(result).resolves.toBe('available');
    expect(worker.listenerCount()).toBe(0);
  });

  it('a newer version that is already installed when update() returns: "available"', async () => {
    const registration = makeRegistration();
    registration.update.mockImplementation(() => {
      registration.installing = makeWorker('installed');
      return Promise.resolve();
    });
    await expect(checkForUpdate({ registration, isOnline: online })).resolves.toBe('available');
  });

  it('update() ends with a version waiting: "available"', async () => {
    const registration = makeRegistration();
    registration.update.mockImplementation(() => {
      registration.waiting = makeWorker('installed');
      return Promise.resolve();
    });
    await expect(checkForUpdate({ registration, isOnline: online })).resolves.toBe('available');
  });

  it('the new version fails to install (redundant): "error"', async () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    registration.update.mockImplementation(() => {
      registration.installing = worker;
      return Promise.resolve();
    });
    const result = checkForUpdate({ registration, isOnline: online });
    await vi.advanceTimersByTimeAsync(0);
    worker.moveTo('redundant');
    await expect(result).resolves.toBe('error');
    expect(worker.listenerCount()).toBe(0);
  });

  it('update() fails (for example no network): "error"', async () => {
    const registration = makeRegistration();
    registration.update.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(checkForUpdate({ registration, isOnline: online })).resolves.toBe('error');
  });

  it('update() never answers: "error" after exactly 10 seconds, not before', async () => {
    const registration = makeRegistration();
    registration.update.mockImplementation(() => new Promise(() => undefined));
    let result: string | undefined;
    void checkForUpdate({ registration, isOnline: online }).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_TIMEOUT_MS - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe('error');
    expect(UPDATE_CHECK_TIMEOUT_MS).toBe(10_000);
  });

  it('a version that never finishes installing: "error" after the time limit, listener removed', async () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    registration.update.mockImplementation(() => {
      registration.installing = worker;
      return Promise.resolve();
    });
    const result = checkForUpdate({ registration, isOnline: online, timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe('error');
    expect(worker.listenerCount()).toBe(0);
  });

  it('update() answers only after the time limit: no listener is added late', async () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    let answer: () => void = () => undefined;
    registration.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answer = () => {
            registration.installing = worker;
            resolve();
          };
        }),
    );
    const result = checkForUpdate({ registration, isOnline: online, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe('error');
    answer();
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.listenerCount()).toBe(0);
  });
});
