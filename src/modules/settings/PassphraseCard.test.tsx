import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { PassphraseCard } from './PassphraseCard';

// logOut is mocked: this file tests the CARD. The real removal of the saved key is covered in core/identity/session.test.ts.
const { logOutMock } = vi.hoisted(() => ({ logOutMock: vi.fn() }));

vi.mock('../../core/identity/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logOut: logOutMock,
}));

const logoutButton = () => screen.getByRole('button', { name: t('passphrase.logout') });
const confirmButton = () => screen.getByRole('button', { name: t('passphrase.logoutConfirm') });
const cancelButton = () => screen.getByRole('button', { name: t('passphrase.cancel') });

beforeEach(() => {
  logOutMock.mockReset();
  logOutMock.mockResolvedValue(undefined);
});

describe('PassphraseCard: information', () => {
  it('explains the 12 words: never stored here, needed on a new device / after clearing / after logging out, no recovery', () => {
    render(<PassphraseCard />);
    expect(screen.getByRole('heading', { level: 2, name: t('passphrase.title') })).toBeInTheDocument();
    const body = screen.getByText(t('passphrase.body')).textContent ?? '';
    expect(body).toContain('never stored');
    expect(body).toContain('new device');
    expect(body).toContain('logging out');
    expect(body).toContain('nobody can recover');
  });

  it('is read-only: shows no input field and only the Log out button at first', () => {
    render(<PassphraseCard />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(logoutButton()).toBeEnabled();
  });

  it('hides the decorative icons from screen readers', () => {
    const { container } = render(<PassphraseCard />);
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg.closest('[aria-hidden="true"]') ?? svg.getAttribute('aria-hidden')).toBeTruthy();
    }
  });
});

describe('PassphraseCard: Log out', () => {
  it('does not log out on the first press: it asks first and warns that the 12 words are needed again', () => {
    render(<PassphraseCard />);
    fireEvent.click(logoutButton());
    expect(logOutMock).not.toHaveBeenCalled();
    expect(screen.getByText(t('passphrase.logoutWarn'))).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    expect(cancelButton()).toBeEnabled();
  });

  it('Cancel closes the question and logs nobody out', () => {
    render(<PassphraseCard />);
    fireEvent.click(logoutButton());
    fireEvent.click(cancelButton());
    expect(logOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText(t('passphrase.logoutWarn'))).not.toBeInTheDocument();
    expect(logoutButton()).toBeInTheDocument();
  });

  it('"Yes, log out" calls logOut once', async () => {
    render(<PassphraseCard />);
    fireEvent.click(logoutButton());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(logOutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(t('passphrase.logoutWarn'))).not.toBeInTheDocument());
  });

  it('disables both buttons while logging out and calls logOut only once', async () => {
    let finish: (value?: unknown) => void = () => undefined;
    logOutMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<PassphraseCard />);
    fireEvent.click(logoutButton());
    fireEvent.click(confirmButton());

    await waitFor(() => expect(confirmButton()).toBeDisabled());
    expect(cancelButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(logOutMock).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.queryByText(t('passphrase.logoutWarn'))).not.toBeInTheDocument());
  });

  it('when logging out fails: shows a readable message (never the raw error) and allows another try', async () => {
    logOutMock.mockRejectedValueOnce(new Error('database locked'));
    render(<PassphraseCard />);
    fireEvent.click(logoutButton());
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('passphrase.logoutFailed'));
    expect(alert).not.toHaveTextContent('database locked');
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    fireEvent.click(confirmButton());
    await waitFor(() => expect(logOutMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
