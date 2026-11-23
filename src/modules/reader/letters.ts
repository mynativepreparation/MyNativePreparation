// Splits text into "letters" the way a reader sees them, for the per-letter boxes (P10 T11k, DECISIONS Q26).
// One Gujarati letter is often several characters (a base letter + a vowel sign, or a conjunct like ક્ષ), and a box must go around the whole
// thing, never around half of it. Pure functions; they never throw and never lose a character (the pieces always join back to the text).

/** The part of `Intl.Segmenter` that is used here (older TypeScript DOM typings do not know it). */
export interface LetterSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

type SegmenterConstructor = new (locales?: string | string[], options?: { granularity: 'grapheme' }) => LetterSegmenter;

/**
 * Fallback for browsers without `Intl.Segmenter`: a base character plus all its combining marks; a virama (U+0ACD, the Gujarati
 * vowel killer) followed by a letter joins the next letter too, so conjuncts stay in one piece. A lone mark at the start is its own piece.
 */
const FALLBACK = /(?:\P{M}\p{M}*\u0ACD(?=\p{L}))*\P{M}\p{M}*|\p{M}+/gu;

export function splitLettersFallback(text: string): string[] {
  return text.match(FALLBACK) ?? [];
}

let cached: LetterSegmenter | null | undefined;

/** The browser's grapheme segmenter, or null when there is none. Created once. */
export function defaultLetterSegmenter(): LetterSegmenter | null {
  if (cached !== undefined) return cached;
  try {
    const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
    cached = Segmenter === undefined ? null : new Segmenter(undefined, { granularity: 'grapheme' });
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Text -> letters. Uses the browser's grapheme segmenter when there is one, otherwise (or if it ever gives a result that does not
 * join back to the same text) the fallback. `segmenter` can be passed in for tests.
 */
export function splitLetters(text: string, segmenter: LetterSegmenter | null = defaultLetterSegmenter()): string[] {
  if (text === '') return [];
  if (segmenter !== null) {
    try {
      const parts = Array.from(segmenter.segment(text), (part) => part.segment);
      if (parts.join('') === text) return parts;
    } catch {
      // fall through to the fallback
    }
  }
  return splitLettersFallback(text);
}

/** Spaces, tabs and line breaks never get a box. */
export function isBlankLetter(letter: string): boolean {
  return /^\s+$/.test(letter);
}
