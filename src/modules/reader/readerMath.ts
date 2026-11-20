// Pure helpers for the reader (P06 T2). No DOM, no React, no storage: easy to test.
// The text pinch zoom is our own code (DECISIONS Q17): it must change the font size, not scale pixels.

export const MIN_SCALE = 0.8;
export const MAX_SCALE = 2.0;
export const DEFAULT_SCALE = 1;

/** Keeps a font scale inside MIN_SCALE..MAX_SCALE. A value that is not a finite number gives DEFAULT_SCALE. */
export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * New font scale for a two-finger pinch: the start scale times how much the distance between
 * the fingers changed. Fingers apart = bigger text, fingers together = smaller text.
 * A start distance that is not a positive number, or a distance that is not a non-negative
 * number, cannot be compared, so the start scale is kept (still clamped).
 */
export function pinchScale(startDistance: number, distance: number, startScale: number): number {
  const valid =
    Number.isFinite(startDistance) && startDistance > 0 && Number.isFinite(distance) && distance >= 0;
  if (!valid) return clampScale(startScale);
  return clampScale(startScale * (distance / startDistance));
}

/**
 * Splits plain text into paragraphs on blank lines (a line with only spaces counts as blank).
 * Single line breaks inside a paragraph are kept as they are. Each paragraph is trimmed,
 * empty ones are dropped. Missing or empty text gives []. The text is never parsed as HTML.
 */
export function splitParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
