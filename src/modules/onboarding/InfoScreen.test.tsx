import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { InfoScreen } from './InfoScreen';

// repo.saveProfile is mocked: this file tests the SCREEN. Real encryption of the profile is covered in core/storage/repo.test.ts.
const { saveProfileMock } = vi.hoisted(() => ({ saveProfileMock: vi.fn() }));

vi.mock('../../core/storage/repo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveProfile: saveProfileMock,
}));

function renderInfo() {
  return render(
    <MemoryRouter initialEntries={['/info']}>
      <Routes>
        <Route path="/info" element={<InfoScreen />} />
        <Route path="/privacy" element={<p>PRIVACY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const nameInput = () => screen.getByLabelText(t('info.name'));
const emailInput = () => screen.getByLabelText(t('info.email'));
const phoneInput = () => screen.getByLabelText(t('info.phone'));
const saveButton = () => screen.getByRole('button', { name: t('info.save') });
const skipButton = () => screen.getByRole('button', { name: t('info.skip') });

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  saveProfileMock.mockReset();
  saveProfileMock.mockResolvedValue(undefined);
});

describe('InfoScreen: layout', () => {
  it('has a main heading, says the details are optional and has three labelled fields', () => {
    renderInfo();
    expect(screen.getByRole('heading', { level: 1, name: t('info.title') })).toBeInTheDocument();
    expect(screen.getByText(t('info.intro'))).toBeInTheDocument();
    expect(t('info.intro')).toContain('works without');
    expect(nameInput()).toBeInTheDocument();
    expect(emailInput()).toBeInTheDocument();
    expect(phoneInput()).toBeInTheDocument();
  });

  it('has no required field', () => {
    renderInfo();
    for (const input of [nameInput(), emailInput(), phoneInput()]) {
      expect(input).not.toBeRequired();
    }
  });

  it('asks the browser for the right keyboards and autofill', () => {
    renderInfo();
    expect(nameInput()).toHaveAttribute('autocomplete', 'name');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(phoneInput()).toHaveAttribute('type', 'tel');
    expect(phoneInput()).toHaveAttribute('autocomplete', 'tel');
  });
});

describe('InfoScreen: Skip', () => {
  it('goes to the privacy screen without saving anything, even when fields are filled', () => {
    renderInfo();
    type(nameInput(), 'Asha');
    fireEvent.click(skipButton());
    expect(screen.getByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).not.toHaveBeenCalled();
  });
});

describe('InfoScreen: Save', () => {
  it('saves the trimmed details and goes to the privacy screen', async () => {
    renderInfo();
    type(nameInput(), '  Asha Patel  ');
    type(emailInput(), ' asha@example.com ');
    type(phoneInput(), ' 98250 12345 ');
    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledTimes(1);
    expect(saveProfileMock).toHaveBeenCalledWith({
      name: 'Asha Patel',
      email: 'asha@example.com',
      phone: '98250 12345',
    });
  });

  it('leaves out the fields that stay empty or only hold spaces', async () => {
    renderInfo();
    type(nameInput(), 'Asha');
    type(phoneInput(), '   ');
    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledWith({ name: 'Asha' });
  });

  it('saves Gujarati text unchanged', async () => {
    renderInfo();
    type(nameInput(), 'આશા પટેલ');
    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledWith({ name: 'આશા પટેલ' });
  });

  it('with everything empty it just goes on and writes no empty profile', () => {
    renderInfo();
    fireEvent.click(saveButton());
    expect(screen.getByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).not.toHaveBeenCalled();
  });

  it('works with the Enter key (the fields are inside a form)', async () => {
    const { container } = renderInfo();
    type(nameInput(), 'Asha');
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledWith({ name: 'Asha' });
  });
});

describe('InfoScreen: email check', () => {
  it.each(['asha', 'asha@', '@example.com', 'asha@example', 'asha @example.com', 'asha@exa mple.com'])(
    'rejects "%s", shows the message and does not save',
    (bad) => {
      renderInfo();
      type(emailInput(), bad);
      fireEvent.click(saveButton());
      expect(screen.getByText(t('info.emailInvalid'))).toBeInTheDocument();
      expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
      expect(saveProfileMock).not.toHaveBeenCalled();
      expect(screen.queryByText('PRIVACY SCREEN')).not.toBeInTheDocument();
    },
  );

  it('clears the message when the person edits the email, then saves', async () => {
    renderInfo();
    type(emailInput(), 'asha');
    fireEvent.click(saveButton());
    expect(screen.getByText(t('info.emailInvalid'))).toBeInTheDocument();

    type(emailInput(), 'asha@example.com');
    expect(screen.queryByText(t('info.emailInvalid'))).not.toBeInTheDocument();
    expect(emailInput()).not.toHaveAttribute('aria-invalid');

    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledWith({ email: 'asha@example.com' });
  });

  it('does not check an empty email (it is optional)', async () => {
    renderInfo();
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(screen.queryByText(t('info.emailInvalid'))).not.toBeInTheDocument();
  });

  it('a skipped invalid email never blocks Skip', () => {
    renderInfo();
    type(emailInput(), 'not an email');
    fireEvent.click(skipButton());
    expect(screen.getByText('PRIVACY SCREEN')).toBeInTheDocument();
  });
});

describe('InfoScreen: when saving fails', () => {
  it.each([
    ['an unexpected error', () => saveProfileMock.mockRejectedValue(new Error('disk full'))],
    ['a locked store', () => saveProfileMock.mockRejectedValue(Object.assign(new Error('locked'), { name: 'LockedError' }))],
  ])('shows a readable message after %s, stays on the screen and offers Skip', async (_label, arrange) => {
    arrange();
    renderInfo();
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('info.saveFailed'));
    expect(alert).not.toHaveTextContent('disk full');
    expect(alert).not.toHaveTextContent('locked');
    expect(screen.queryByText('PRIVACY SCREEN')).not.toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeEnabled());

    fireEvent.click(skipButton());
    expect(screen.getByText('PRIVACY SCREEN')).toBeInTheDocument();
  });

  it('lets the person try again and goes on when the second try works', async () => {
    saveProfileMock.mockRejectedValueOnce(new Error('first try fails'));
    renderInfo();
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());
    await screen.findByRole('alert');
    await waitFor(() => expect(saveButton()).toBeEnabled());

    fireEvent.click(saveButton());
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
    expect(saveProfileMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables both buttons while saving and saves only once', async () => {
    let finish: (value?: unknown) => void = () => undefined;
    saveProfileMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderInfo();
    type(nameInput(), 'Asha');
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(skipButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(saveProfileMock).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText('PRIVACY SCREEN')).toBeInTheDocument();
  });
});
