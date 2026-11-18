import { colors, cssVarName, type ColorTokens, type ThemeName } from '../ui/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'np.theme';

const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode: ThemeMode): ThemeName {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Writes the colors as CSS variables on <html> and marks the active theme.
export function applyTheme(mode: ThemeMode = getThemeMode()): ThemeName {
  const name = resolveTheme(mode);
  const root = document.documentElement;
  const palette = colors[name];
  (Object.keys(palette) as (keyof ColorTokens)[]).forEach((key) => {
    root.style.setProperty(cssVarName(key), palette[key]);
  });
  root.dataset.theme = name;
  root.style.colorScheme = name;
  root.style.backgroundColor = palette.surface;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.surface);
  return name;
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // storage blocked: the theme still applies for this session
  }
  applyTheme(mode);
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Call once before the first render. Also follows the device setting while mode is 'system'.
export function initTheme(): void {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemeMode() === 'system') {
      applyTheme('system');
      listeners.forEach((l) => l());
    }
  });
}
