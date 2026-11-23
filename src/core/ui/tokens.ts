// Single source of truth for ALL colors (light + dark).
// The theme engine writes these as CSS variables (--np-color-<kebab-name>) on <html>.
// contrast.test.ts (P02 T8) fails if any pair drops below the WCAG limits.
// Non-color tokens (radius, spacing, fonts, motion, shadows) live in tokens.css.

// 'colour' (P10 T11u, Q28): bright pastel colours everywhere; every text on a light colour is a DARK shade of the SAME hue.
export type ThemeName = 'light' | 'dark' | 'colour';

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
  star: string; // earned stars in the Test result (non-text, needs 3:1 against surface)
  // Text colours the developer can give to letters, words and lines (P10 T11k, core/content/richStyles.ts COLOR_IDS).
  // Each one needs 4.5:1 against surface AND against its own 14% tint (the box behind boxed text); ink.contrast.test.ts checks both.
  inkRed: string;
  inkOrange: string;
  inkBrown: string;
  inkGreen: string;
  inkTeal: string;
  inkBlue: string;
  inkPurple: string;
  inkPink: string;
  // Coloured fills (P10 T11u, Q28). `fill` is the background of primary buttons and `onFill` the text on it. `tint1`..`tint6` are the six
  // tile / card backgrounds and `onTintN` the text on `tintN`. In the light and dark themes they equal accent / onAccent and surface / text,
  // so nothing changes there. In the colour theme they are pastel fills with a dark shade of the same hue as text (colour.contrast.test.ts).
  fill: string;
  onFill: string;
  tint1: string;
  tint2: string;
  tint3: string;
  tint4: string;
  tint5: string;
  tint6: string;
  onTint1: string;
  onTint2: string;
  onTint3: string;
  onTint4: string;
  onTint5: string;
  onTint6: string;
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
    star: '#9a5700',
    inkRed: '#a8221b',
    inkOrange: '#964400',
    inkBrown: '#6f421d',
    inkGreen: '#145f35',
    inkTeal: '#005f5f',
    inkBlue: '#1b47a8',
    inkPurple: '#702a9b',
    inkPink: '#a01f58',
    fill: '#4b5bd6',
    onFill: '#ffffff',
    tint1: '#e6e9f0',
    tint2: '#e6e9f0',
    tint3: '#e6e9f0',
    tint4: '#e6e9f0',
    tint5: '#e6e9f0',
    tint6: '#e6e9f0',
    onTint1: '#1f2430',
    onTint2: '#1f2430',
    onTint3: '#1f2430',
    onTint4: '#1f2430',
    onTint5: '#1f2430',
    onTint6: '#1f2430',
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
    star: '#ffc857',
    inkRed: '#ff8a80',
    inkOrange: '#ffb066',
    inkBrown: '#d8a77a',
    inkGreen: '#6fd39a',
    inkTeal: '#5fd3d3',
    inkBlue: '#8fb4ff',
    inkPurple: '#cf9bff',
    inkPink: '#ff94bd',
    fill: '#8f9bff',
    onFill: '#14172a',
    tint1: '#23262e',
    tint2: '#23262e',
    tint3: '#23262e',
    tint4: '#23262e',
    tint5: '#23262e',
    tint6: '#23262e',
    onTint1: '#eceff5',
    onTint2: '#eceff5',
    onTint3: '#eceff5',
    onTint4: '#eceff5',
    onTint5: '#eceff5',
    onTint6: '#eceff5',
  },
  // Pastel theme. Page = very light lavender, text = dark violet (same hue family). Tiles: pink, peach, yellow, mint, sky, lavender,
  // each with a dark shade of its own hue as text. The ratios were computed first and are kept above the limits with room to spare.
  colour: {
    surface: '#f7f2ff',
    text: '#2b1b4e',
    textMuted: '#5a4a80',
    accent: '#5b2db5',
    onAccent: '#ffffff',
    border: '#6e5aa8',
    shadowLight: '#ffffff',
    shadowDark: '#cfc4ea',
    danger: '#b3261e',
    success: '#17693a',
    star: '#9a5700',
    inkRed: '#a8221b',
    inkOrange: '#964400',
    inkBrown: '#6f421d',
    inkGreen: '#145f35',
    inkTeal: '#005f5f',
    inkBlue: '#1b47a8',
    inkPurple: '#702a9b',
    inkPink: '#a01f58',
    fill: '#c3b1ff',
    onFill: '#2e1470',
    tint1: '#ffd6e7',
    tint2: '#ffe0c2',
    tint3: '#fff3b0',
    tint4: '#c8f2d6',
    tint5: '#c9e6ff',
    tint6: '#e1d4ff',
    onTint1: '#7a1240',
    onTint2: '#7a3300',
    onTint3: '#5c4a00',
    onTint4: '#0d5a2b',
    onTint5: '#0b3f7a',
    onTint6: '#4a2090',
  },
};

// textMuted -> --np-color-text-muted
export function cssVarName(key: keyof ColorTokens): string {
  return '--np-color-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
