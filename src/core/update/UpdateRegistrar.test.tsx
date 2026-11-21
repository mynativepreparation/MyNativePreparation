import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateRegistration } from './checkForUpdate';
import { UpdateRegistrar } from './UpdateRegistrar';
import { getUpdateState, resetUpdateState } from './updateStore';

// P09 T1: the one place that registers the service worker. The virtual module of vite-plugin-pwa is replaced by a fake.

interface FakeOptions {
  onRegisteredSW?: (swUrl: string, registration: UpdateRegistration | undefined) => void;
  onNeedRefresh?: () => void;
}

const fake = vi.hoisted(() => ({
  options: undefined as FakeOptions | undefined,
  updateServiceWorker: vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve()),
  useRegisterSW: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: fake.useRegisterSW }));

const registration: UpdateRegistration = { installing: null, waiting: null, update: () => Promise.resolve() };

beforeEach(() => {
  fake.options = undefined;
  fake.updateServiceWorker.mockClear();
  fake.useRegisterSW.mockReset();
  fake.useRegisterSW.mockImplementation((options: FakeOptions) => {
    fake.options = options;
    return { needRefresh: [false, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker: fake.updateServiceWorker };
  });
});

afterEach(() => {
  resetUpdateState();
});

describe('UpdateRegistrar', () => {
  it('renders nothing and registers once', () => {
    const { container } = render(<UpdateRegistrar />);
    expect(container).toBeEmptyDOMElement();
    expect(fake.useRegisterSW).toHaveBeenCalledTimes(1);
  });

  it('puts the registration into the store when the service worker is registered', () => {
    render(<UpdateRegistrar />);
    expect(getUpdateState().registration).toBeUndefined();
    fake.options?.onRegisteredSW?.('/sw.js', registration);
    expect(getUpdateState().registration).toBe(registration);
  });

  it('a registration that did not happen (undefined) leaves the store without one', () => {
    render(<UpdateRegistrar />);
    fake.options?.onRegisteredSW?.('/sw.js', undefined);
    expect(getUpdateState().registration).toBeUndefined();
  });

  it('marks the store when a new version is waiting', () => {
    render(<UpdateRegistrar />);
    expect(getUpdateState().needRefresh).toBe(false);
    fake.options?.onNeedRefresh?.();
    expect(getUpdateState().needRefresh).toBe(true);
  });

  it('gives the store an apply function that switches to the new version and reloads (updateServiceWorker(true))', async () => {
    render(<UpdateRegistrar />);
    const apply = getUpdateState().apply;
    expect(apply).toBeDefined();
    await apply?.();
    expect(fake.updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(fake.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
