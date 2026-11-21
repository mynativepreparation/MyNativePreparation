import { colors } from '../../core/ui/tokens';
import type { Rgb } from './pdf/surface';

// The ONE place for the colours of the printed report (P08 T5). They come from the light theme of the app tokens
// (core/ui/tokens.ts), so the PDF matches the app; a few tints are mixed with white for a printed page.
// The page itself is always white (it is paper), also when the app is in dark mode.

/** '#rrggbb' -> [r, g, b], each 0..1. Throws on any other input. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`not a #rrggbb colour: ${hex}`);
  const channel = (part: string | undefined): number => Number.parseInt(part ?? '0', 16) / 255;
  return [channel(match[1]), channel(match[2]), channel(match[3])];
}

/** `amount` 0 = `from`, 1 = `to`. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const blend = (a: number, b: number): number => a + (b - a) * amount;
  return [blend(from[0], to[0]), blend(from[1], to[1]), blend(from[2], to[2])];
}

const light = colors.light;
const WHITE: Rgb = [1, 1, 1];
const accent = hexToRgb(light.accent);

export const palette = {
  page: WHITE,
  /** Header band, card stripe, totals numbers, "best" bar. */
  band: accent,
  onBand: hexToRgb(light.onAccent),
  /** Soft text on the band (the date). */
  onBandSoft: mix(accent, WHITE, 0.92),
  /** Thin gold line under the header band (decoration only; the dark theme star gold is the brighter one). */
  stripe: hexToRgb(colors.dark.star),
  text: hexToRgb(light.text),
  textMuted: hexToRgb(light.textMuted),
  /** Course card background. */
  card: mix(hexToRgb(light.surface), WHITE, 0.55),
  /** Totals tile background. */
  tile: mix(accent, WHITE, 0.88),
  /** Empty part of a progress bar. */
  track: mix(hexToRgb(light.shadowDark), WHITE, 0.45),
  /** Its own array (not the `band` one), so a colour match in the tests finds only the bars. */
  barBest: hexToRgb(light.accent),
  barLast: hexToRgb(light.success),
  /** Earned star (3:1 against white, like in the app). */
  star: hexToRgb(light.star),
  /** Star that was not earned. */
  starOff: mix(hexToRgb(light.border), WHITE, 0.6),
} as const satisfies Record<string, Rgb>;
