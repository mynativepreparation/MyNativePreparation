import { colors, cssVarName, type ColorTokens, type ThemeName } from '../ui/tokens';

// The look the person picked: light, dark or colour (the pastel one, P10 Q28). There is no "follow the device" mode any more.
export type ThemeMode = ThemeName;

export const THEME_STORAGE_KEY = 'np.theme';

export const DEFAULT_THEME: ThemeMode = 'light';

const listeners = new Set<() => void>();

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'colour';
}

// A missing, invalid or old value (the removed "system" mode) reads as the default.
export function getThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// Writes the colors as CSS variables on <html> and marks the active theme.
export function applyTheme(mode: ThemeMode = getThemeMode()): ThemeName {
  const name = isThemeMode(mode) ? mode : DEFAULT_THEME;
  const root = document.documentElement;
  const palette = colors[name];
  (Object.keys(palette) as (keyof ColorTokens)[]).forEach((key) => {
    root.style.setProperty(cssVarName(key), palette[key]);
  });
  root.dataset.theme = name;
  root.style.colorScheme = name === 'dark' ? 'dark' : 'light'; // the colour theme is a light one
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

// Call once before the first render.
export function initTheme(): void {
  applyTheme();
}
