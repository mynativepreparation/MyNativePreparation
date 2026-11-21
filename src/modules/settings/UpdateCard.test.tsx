import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { t } from '../../core/i18n';
import type { UpdateWorker } from '../../core/update/checkForUpdate';
import { resetUpdateState, setUpdateState } from '../../core/update/updateStore';
import { UpdateCard } from './UpdateCard';

// P09 T2: the "Update app" card. The real check logic is tested in core/update; here the store holds a fake registration.

interface FakeRegistration {
  installing: UpdateWorker | null;
  waiting: UpdateWorker | null;
  update: Mock<() => Promise<unknown>>;
}

function makeRegistration(update: () => Promise<unknown> = () => Promise.resolve()): FakeRegistration {
  return { installing: null, waiting: null, update: vi.fn<() => Promise<unknown>>(update) };
}

const waitingWorker: UpdateWorker = {
  state: 'installed',
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

const status = () => screen.getByRole('status');
const checkButton = () => screen.getByRole('button', { name: t('update.check') });
const updateNowButton = () => screen.getByRole('button', { name: t('update.now') });

afterEach(() => {
  vi.restoreAllMocks();
  resetUpdateState();
});

describe('UpdateCard: first look', () => {
  it('shows the title, one sentence of explanation and the check button, and nothing else', () => {
    setUpdateState({ registration: makeRegistration() });
    render(<UpdateCard />);
    expect(screen.getByRole('heading', { level: 2, name: t('update.title') })).toBeInTheDocument();
    expect(screen.getByText(t('update.body'))).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(checkButton()).toBeEnabled();
  });

  it('has a polite live region from the start, empty until something happens', () => {
    render(<UpdateCard />);
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(status()).toBeEmptyDOMElement();
  });

  it('uses real buttons that take keyboard focus (Enter and Space work on a real button)', () => {
    render(<UpdateCard />);
    const check = checkButton();
    expect(check.tagName).toBe('BUTTON');
    expect(check).toHaveAttribute('type', 'button');
    check.focus();
    expect(check).toHaveFocus();
  });
});

describe('UpdateCard: checking', () => {
  it('nothing newer: says "latest version", asks the browser once, button is free again', async () => {
    const registration = makeRegistration();
    setUpdateState({ registration });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.latest')));
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(checkButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: t('update.now') })).not.toBeInTheDocument();
  });

  it('while the check runs: busy text, the button is disabled and marked busy, a second click does nothing', async () => {
    let finish: () => void = () => undefined;
    const registration = makeRegistration(
      () =>
        new Promise<void>((resolve) => {
          finish = () => resolve();
        }),
    );
    setUpdateState({ registration });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    expect(status()).toHaveTextContent(t('update.checking'));
    expect(checkButton()).toBeDisabled();
    expect(checkButton()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(checkButton());
    expect(registration.update).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(status()).toHaveTextContent(t('update.latest')));
    expect(checkButton()).toBeEnabled();
  });

  it('offline: says so and does not ask the network', async () => {
    setOnline(false);
    const registration = makeRegistration();
    setUpdateState({ registration });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.offline')));
    expect(registration.update).not.toHaveBeenCalled();
    expect(checkButton()).toBeEnabled();
  });

  it('no service worker (dev server): says updates are checked in the installed app', async () => {
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.unsupported')));
    expect(screen.queryByRole('button', { name: t('update.now') })).not.toBeInTheDocument();
  });

  it('the check fails: friendly text, the raw error is never shown, the button is free to try again', async () => {
    const registration = makeRegistration(() => Promise.reject(new Error('secret details')));
    setUpdateState({ registration });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.error')));
    expect(document.body).not.toHaveTextContent('secret details');
    expect(checkButton()).toBeEnabled();
  });

  it('a newer version is found: "ready" and Update now replace the check button', async () => {
    const registration = makeRegistration();
    registration.update.mockImplementation(() => {
      registration.waiting = waitingWorker;
      return Promise.resolve();
    });
    setUpdateState({ registration });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.ready')));
    expect(updateNowButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('update.check') })).not.toBeInTheDocument();
  });
});

describe('UpdateCard: a version that is already waiting', () => {
  it('shows "ready" and Update now at once, without asking the network', () => {
    const registration = makeRegistration();
    setUpdateState({ registration, needRefresh: true, apply: vi.fn<() => Promise<void>>(() => Promise.resolve()) });
    render(<UpdateCard />);
    expect(status()).toHaveTextContent(t('update.ready'));
    expect(updateNowButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: t('update.check') })).not.toBeInTheDocument();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('reacts when the service worker reports the new version after the card is already shown', () => {
    render(<UpdateCard />);
    expect(screen.queryByRole('button', { name: t('update.now') })).not.toBeInTheDocument();
    act(() => {
      setUpdateState({ needRefresh: true, apply: vi.fn<() => Promise<void>>(() => Promise.resolve()) });
    });
    expect(status()).toHaveTextContent(t('update.ready'));
    expect(updateNowButton()).toBeEnabled();
  });

  it('Update now is disabled while the app cannot apply the update yet (not registered)', () => {
    setUpdateState({ needRefresh: true });
    render(<UpdateCard />);
    expect(updateNowButton()).toBeDisabled();
  });
});

describe('UpdateCard: Update now', () => {
  it('applies the update once, shows "Updating", and the button is disabled and marked busy', () => {
    const apply = vi.fn<() => Promise<void>>(() => Promise.resolve());
    setUpdateState({ needRefresh: true, apply });
    render(<UpdateCard />);
    fireEvent.click(updateNowButton());
    expect(apply).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent(t('update.applying'));
    expect(updateNowButton()).toBeDisabled();
    expect(updateNowButton()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(updateNowButton());
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('the update fails: friendly text, no raw error, and Update now is free to try again', async () => {
    const apply = vi.fn<() => Promise<void>>(() => Promise.reject(new Error('secret details')));
    setUpdateState({ needRefresh: true, apply });
    render(<UpdateCard />);
    fireEvent.click(updateNowButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.applyFailed')));
    expect(document.body).not.toHaveTextContent('secret details');
    expect(updateNowButton()).toBeEnabled();
    fireEvent.click(updateNowButton());
    expect(apply).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(status()).toHaveTextContent(t('update.applyFailed')));
  });

  it('warning messages start with a "!" that screen readers skip (not color alone)', async () => {
    setOnline(false);
    setUpdateState({ registration: makeRegistration() });
    render(<UpdateCard />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(status()).toHaveTextContent(t('update.offline')));
    const mark = status().querySelector('span');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveTextContent('!');
  });
});
