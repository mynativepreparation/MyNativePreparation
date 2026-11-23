// Formatting helpers for the chapter editor toolbar (P10 T11e, DECISIONS Q25). Pure functions: they get the text and the selection
// of a text box and return the new text and the new selection. They only add or remove the marks of core/content/inline.ts:
//   **bold**   *italic*   __underline__   ==highlight==   and "- " bullets.
// Never throw; a selection outside the text is clamped.

export type MarkKind = 'bold' | 'italic' | 'underline' | 'highlight';

/** The new text of the box and the selection to put back (so the keyboard cursor stays where the person was). */
export interface Edit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const MARKS: Record<MarkKind, { char: string; size: number }> = {
  bold: { char: '*', size: 2 },
  italic: { char: '*', size: 1 },
  underline: { char: '_', size: 2 },
  highlight: { char: '=', size: 2 },
};

/** Is the mark already on when this many of its characters stand next to the text? For `*`: 1 = italic, 2 = bold, 3 = both. */
function isOn(mark: MarkKind, run: number): boolean {
  return mark === 'italic' ? run % 2 === 1 : run >= 2;
}

function clampRange(text: string, start: number, end: number): [number, number] {
  const a = Number.isFinite(start) ? Math.trunc(start) : 0;
  const b = Number.isFinite(end) ? Math.trunc(end) : a;
  const low = Math.max(0, Math.min(text.length, Math.min(a, b)));
  const high = Math.max(0, Math.min(text.length, Math.max(a, b)));
  return [low, high];
}

/** How many `char` stand in a row directly BEFORE position `index`. */
function runBefore(text: string, index: number, char: string): number {
  let n = 0;
  while (index - 1 - n >= 0 && text.charAt(index - 1 - n) === char) n += 1;
  return n;
}

/** How many `char` stand in a row from position `index` on. */
function runFrom(text: string, index: number, char: string): number {
  let n = 0;
  while (index + n < text.length && text.charAt(index + n) === char) n += 1;
  return n;
}

/**
 * Switches one mark on or off for the selected text.
 * - Spaces at the edges of the selection stay OUTSIDE the marks (a mark may not open or close next to a space).
 * - Already marked (the marks stand right outside the selection, or are the first and last characters of it): the marks are removed.
 * - Italic next to bold gives `***x***` (both); removing one of them leaves the other.
 * Returns null when nothing is selected (or only spaces / only mark characters): there is nothing to mark.
 */
export function applyMark(text: string, selectionStart: number, selectionEnd: number, mark: MarkKind): Edit | null {
  const { char, size } = MARKS[mark];
  let [start, end] = clampRange(text, selectionStart, selectionEnd);
  while (start < end && /\s/.test(text.charAt(start))) start += 1;
  while (end > start && /\s/.test(text.charAt(end - 1))) end -= 1;
  if (start === end) return null;
  if (text.slice(start, end).split(char).join('') === '') return null;

  // The marks stand just outside the selection: remove them.
  const outside = Math.min(runBefore(text, start, char), runFrom(text, end, char));
  if (isOn(mark, outside)) {
    return {
      text: text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size),
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }

  // The selection itself is wrapped in the marks (for example the whole "**word**" is selected): remove them.
  const lead = runFrom(text.slice(0, end), start, char);
  const trail = runBefore(text.slice(start), end - start, char);
  const inside = Math.min(lead, trail);
  if (isOn(mark, inside) && end - start > 2 * size && !text.slice(start + inside, end - inside).includes(char)) {
    return {
      text: text.slice(0, start) + text.slice(start + size, end - size) + text.slice(end),
      selectionStart: start,
      selectionEnd: end - 2 * size,
    };
  }

  const marker = char.repeat(size);
  return {
    text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end),
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}

/**
 * Bullets for the lines the selection touches (or the line of the cursor).
 * - If every filled line already starts with "- ", the bullets are removed.
 * - Otherwise every filled line gets "- " (lines that already have it keep it). Blank lines between stay blank.
 * - An empty line (nothing else filled) becomes "- ".
 * The new selection covers the changed lines.
 */
export function toggleBullets(text: string, selectionStart: number, selectionEnd: number): Edit {
  const [start, end] = clampRange(text, selectionStart, selectionEnd);
  // A selection that ends right after a line break does not include the next line.
  const lastIncluded = end > start && text.charAt(end - 1) === '\n' ? end - 1 : end;
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', lastIncluded);
  const to = lineEnd === -1 ? text.length : lineEnd;

  const lines = text.slice(from, to).split('\n');
  const filled = lines.filter((line) => line.trim() !== '');
  const allBullets = filled.length > 0 && filled.every((line) => line.startsWith('- '));
  const changed = lines.map((line) => {
    if (allBullets) return line.startsWith('- ') ? line.slice(2) : line;
    if (line.trim() === '' && filled.length > 0) return line;
    return line.startsWith('- ') ? line : `- ${line}`;
  });
  const block = changed.join('\n');
  return {
    text: text.slice(0, from) + block + text.slice(to),
    selectionStart: from,
    selectionEnd: from + block.length,
  };
}
