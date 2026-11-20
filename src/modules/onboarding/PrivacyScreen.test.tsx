import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import en from '../../core/i18n/en.json';
import { PrivacyScreen } from './PrivacyScreen';

// markOnboarded is mocked: this file tests the SCREEN. The real flag + wire event are covered in core/identity/status.test.ts.
const { markOnboardedMock } = vi.hoisted(() => ({ markOnboardedMock: vi.fn() }));

vi.mock('../../core/identity/status', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markOnboarded: markOnboardedMock,
}));

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <Routes>
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route path="/" element={<p>HOME SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const okButton = () => screen.getByRole('button', { name: t('privacy.ok') });

beforeEach(() => {
  markOnboardedMock.mockReset();
  markOnboardedMock.mockResolvedValue(undefined);
});

describe('PrivacyScreen: wording', () => {
  it('has one main heading and shows the four honest statements as written in en.json', () => {
    renderPrivacy();
    expect(screen.getByRole('heading', { level: 1, name: t('privacy.title') })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByText(t('privacy.noServer'))).toBeInTheDocument();
    expect(screen.getByText(t('privacy.noRecovery'))).toBeInTheDocument();
    expect(screen.getByText(t('privacy.notHidden'))).toBeInTheDocument();
    expect(screen.getByText(t('privacy.github'))).toBeInTheDocument();
  });

  it('says there is no server and no account, and that updates and courses contact GitHub', () => {
    renderPrivacy();
    expect(document.body.textContent).toContain('This app has no server and no account.');
    expect(document.body.textContent).toContain('Checking for updates and downloading courses contacts GitHub.');
  });

  it('states the real limits: nobody can recover the data, some details are not hidden', () => {
    renderPrivacy();
    expect(document.body.textContent).toContain('nobody can recover them if you lose the 12 words');
    expect(document.body.textContent).toContain('are not hidden');
  });

  it('never uses "military" or "unbreakable", neither in en.json nor on the screen', () => {
    renderPrivacy();
    const onScreen = (document.body.textContent ?? '').toLowerCase();
    const allTexts = JSON.stringify(en).toLowerCase();
    for (const word of ['military', 'unbreakable']) {
      expect(allTexts).not.toContain(word);
      expect(onScreen).not.toContain(word);
    }
  });

  it('has one main landmark, one OK button and a decorative (hidden) icon', () => {
    const { container } = renderPrivacy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(okButton()).toBeEnabled();
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe('PrivacyScreen: OK', () => {
  it('remembers that onboarding is finished and goes to Home', async () => {
    renderPrivacy();
    fireEvent.click(okButton());
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(markOnboardedMock).toHaveBeenCalledTimes(1);
  });

  it('does not mark onboarding as finished before OK is pressed', () => {
    renderPrivacy();
    expect(markOnboardedMock).not.toHaveBeenCalled();
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
  });

  it('disables OK while saving and marks onboarding only once', async () => {
    let finish: (value?: unknown) => void = () => undefined;
    markOnboardedMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPrivacy();
    fireEvent.click(okButton());

    await waitFor(() => expect(okButton()).toBeDisabled());
    fireEvent.click(okButton());
    expect(markOnboardedMock).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });
});

describe('PrivacyScreen: when saving fails', () => {
  it('shows a readable message (never the raw error), stays here and lets the person try again', async () => {
    markOnboardedMock.mockRejectedValueOnce(new Error('disk full'));
    renderPrivacy();
    fireEvent.click(okButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('privacy.failed'));
    expect(alert).not.toHaveTextContent('disk full');
    expect(screen.queryByText('HOME SCREEN')).not.toBeInTheDocument();
    await waitFor(() => expect(okButton()).toBeEnabled());

    fireEvent.click(okButton());
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
    expect(markOnboardedMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
