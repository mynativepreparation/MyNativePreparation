import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { colors } from '../ui/tokens';
import { applyTheme, getThemeMode, initTheme, setThemeMode, THEME_STORAGE_KEY } from './theme';

const THEMES = ['light', 'dark', 'colour'] as const;

describe('theme engine', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('defaults to light', () => {
    expect(getThemeMode()).toBe('light');
  });

  it('saves and reads every mode', () => {
    for (const mode of THEMES) {
      setThemeMode(mode);
      expect(getThemeMode()).toBe(mode);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(mode);
    }
  });

  it('falls back to light when the saved value is invalid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getThemeMode()).toBe('light');
  });

  it('reads the removed "system" mode of an older version as light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(getThemeMode()).toBe('light');
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
    applyTheme('colour');
    expect(root.dataset.theme).toBe('colour');
    expect(root.style.getPropertyValue('--np-color-surface')).toBe(colors.colour.surface);
    expect(root.style.getPropertyValue('--np-color-tint1')).toBe(colors.colour.tint1);
    expect(root.style.getPropertyValue('--np-color-on-tint1')).toBe(colors.colour.onTint1);
    expect(root.style.getPropertyValue('--np-color-on-fill')).toBe(colors.colour.onFill);
  });

  it('applies the saved mode when called without one, and light when nothing is saved', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'colour');
    expect(applyTheme()).toBe('colour');
    localStorage.clear();
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('sets color-scheme to dark for dark and to light for light and colour (colour is not a valid color-scheme)', () => {
    const root = document.documentElement;
    applyTheme('dark');
    expect(root.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(root.style.colorScheme).toBe('light');
    applyTheme('colour');
    expect(root.style.colorScheme).toBe('light');
  });

  it('gives the browser bar the page colour of the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.append(meta);
    applyTheme('colour');
    expect(meta.getAttribute('content')).toBe(colors.colour.surface);
    applyTheme('dark');
    expect(meta.getAttribute('content')).toBe(colors.dark.surface);
    meta.remove();
  });
});

describe('no-flash script in index.html', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('holds the page colors of all three themes (the tokens are the source)', () => {
    for (const theme of THEMES) expect(html).toContain(colors[theme].surface);
  });

  it.each(THEMES)('paints the same page color as the theme engine for a saved %s', (mode) => {
    applyTheme(mode);
    const expected = document.documentElement.style.backgroundColor;
    expect(expected).not.toBe('');

    document.documentElement.removeAttribute('style');
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    new Function(script)();
    expect(document.documentElement.style.backgroundColor).toBe(expected);
  });

  it.each([[null], ['purple'], ['system']])('paints the light page color for a saved value of %j', (saved) => {
    applyTheme('light');
    const expected = document.documentElement.style.backgroundColor;

    document.documentElement.removeAttribute('style');
    if (saved !== null) localStorage.setItem(THEME_STORAGE_KEY, saved);
    new Function(script)();
    expect(document.documentElement.style.backgroundColor).toBe(expected);
  });
});
