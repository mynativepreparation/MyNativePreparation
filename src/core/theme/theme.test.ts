import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { colors } from '../ui/tokens';
import { applyTheme, getThemeMode, setThemeMode, THEME_STORAGE_KEY } from './theme';

describe('theme engine', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('defaults to system', () => {
    expect(getThemeMode()).toBe('system');
  });

  it('saves and reads the chosen mode', () => {
    setThemeMode('dark');
    expect(getThemeMode()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('falls back to system when the saved value is invalid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getThemeMode()).toBe('system');
  });

  it('writes the palette as CSS variables and marks the theme', () => {
    applyTheme('dark');
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.getPropertyValue('--np-color-surface')).toBe(colors.dark.surface);
    expect(root.style.getPropertyValue('--np-color-text-muted')).toBe(colors.dark.textMuted);
    applyTheme('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.getPropertyValue('--np-color-surface')).toBe(colors.light.surface);
  });

  it('keeps the no-flash colors in index.html equal to the tokens', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(colors.light.surface);
    expect(html).toContain(colors.dark.surface);
  });
});
