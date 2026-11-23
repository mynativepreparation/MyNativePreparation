import type { SpanStyle } from './inline';
import {
  isWordBoxId,
  letterBoxParts,
  type ColorId,
  type FontId,
  type LetterBoxId,
  type ParagraphBoxId,
  type SizeId,
  type WordBoxId,
} from './richStyles';

// Style id (as stored in the course file) -> CSS class names of RichStyles.css / BlockView.css. Pure and tiny, so a test can prove that
// every id of the catalog has a rule in the stylesheet. Colours are never written here: the classes point at theme tokens.
// Moved here from modules/reader (P10 T11m) so that the reader AND the Admin editing box use the same class names;
// modules/reader/richClasses.ts re-exports this file.

export const inkClass = (id: ColorId): string => `np-ink-${id}`;

export const sizeClass = (id: SizeId): string => `np-size-${id}`;

export const fontClass = (id: FontId): string => `np-font-${id}`;

/** `l-circle-dark` -> `np-lbox np-lbox-circle np-lbox-dark` (the box around each letter). */
export function letterBoxClass(id: LetterBoxId): string {
  const parts = letterBoxParts(id);
  return parts === null ? 'np-lbox' : `np-lbox np-lbox-${parts.shape} np-lbox-${parts.tone}`;
}

/** `w-pill-dark` -> `np-wbox np-wbox-pill-dark` (one box around the marked words). */
export const wordBoxClass = (id: WordBoxId): string => `np-wbox np-wbox-${id.slice(2)}`;

/** `p-dashed` -> `np-pbox np-pbox-dashed` (a box around a whole paragraph or list). */
export const paragraphBoxClass = (id: ParagraphBoxId): string => `np-pbox np-pbox-${id.slice(2)}`;

/**
 * The classes of one span: colour, font, size and a WORD box. A letter box is not here: it goes on every single letter
 * (see letters.ts), not on the whole span.
 */
export function spanClassNames(style: SpanStyle): string[] {
  const names: string[] = [];
  if (style.color !== undefined) names.push(inkClass(style.color));
  if (style.font !== undefined) names.push(fontClass(style.font));
  if (style.size !== undefined) names.push(sizeClass(style.size));
  if (style.box !== undefined && isWordBoxId(style.box)) names.push(wordBoxClass(style.box));
  return names;
}
