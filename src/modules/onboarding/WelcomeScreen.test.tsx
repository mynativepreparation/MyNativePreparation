import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import { WelcomeScreen } from './WelcomeScreen';

function renderWelcome() {
  return render(
    <MemoryRouter initialEntries={['/welcome']}>
      <Routes>
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/register" element={<p>REGISTER SCREEN</p>} />
        <Route path="/login" element={<p>LOGIN SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WelcomeScreen', () => {
  it('shows the app name as the main heading and the tagline', () => {
    renderWelcome();
    expect(screen.getByRole('heading', { level: 1, name: t('app.name') })).toBeInTheDocument();
    expect(screen.getByText(t('welcome.tagline'))).toBeInTheDocument();
  });

  it('offers exactly two buttons: Register and Login', () => {
    renderWelcome();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('describes each button with its hint for screen readers', () => {
    renderWelcome();
    expect(screen.getByRole('button', { name: 'Register' })).toHaveAccessibleDescription(t('welcome.registerHint'));
    expect(screen.getByRole('button', { name: 'Login' })).toHaveAccessibleDescription(t('welcome.loginHint'));
  });

  it('Register leads to the Register screen', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByText('REGISTER SCREEN')).toBeInTheDocument();
  });

  it('Login leads to the Login screen', () => {
    renderWelcome();
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument();
  });

  it('has one main landmark and hides the decorative icons from screen readers', () => {
    const { container } = renderWelcome();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    container.querySelectorAll('svg').forEach((svg) => {
      const hidden = svg.getAttribute('aria-hidden') === 'true' || svg.closest('[aria-hidden="true"]') !== null;
      expect(hidden).toBe(true);
    });
  });
});
