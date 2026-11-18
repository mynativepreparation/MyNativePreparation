// Single source of truth for ALL colors (light + dark).
// The theme engine writes these as CSS variables (--np-color-<kebab-name>) on <html>.
// contrast.test.ts (P02 T8) fails if any pair drops below the WCAG limits.
// Non-color tokens (radius, spacing, fonts, motion, shadows) live in tokens.css.

export type ThemeName = 'light' | 'dark';

export interface ColorTokens {
  surface: string; // page + card background
  text: string; // main text
  textMuted: string; // secondary text
  accent: string; // primary actions, links, active icons
  onAccent: string; // text/icons placed on the accent color
  border: string; // outline of controls (needs 3:1 against surface)
  shadowLight: string; // neumorphism highlight
  shadowDark: string; // neumorphism shade
  danger: string;
  success: string;
}

export const colors: Record<ThemeName, ColorTokens> = {
  light: {
    surface: '#e6e9f0',
    text: '#1f2430',
    textMuted: '#4a5266',
    accent: '#4b5bd6',
    onAccent: '#ffffff',
    border: '#7a8196',
    shadowLight: '#ffffff',
    shadowDark: '#babecc',
    danger: '#b3261e',
    success: '#17693a',
  },
  dark: {
    surface: '#23262e',
    text: '#eceff5',
    textMuted: '#aab1c3',
    accent: '#8f9bff',
    onAccent: '#14172a',
    border: '#7d8499',
    shadowLight: '#2e323c',
    shadowDark: '#181a20',
    danger: '#ff8a80',
    success: '#6fd39a',
  },
};

// textMuted -> --np-color-text-muted
export function cssVarName(key: keyof ColorTokens): string {
  return '--np-color-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
