// Line wrapping for the PDF layout (P08 T5). Pure: the caller passes a `measure` function, so no PDF library is needed here.
//
// Gujarati rule: a conjunct is several characters (ક + ્ + ષ = ક્ષ) and a vowel sign belongs to the letter before it.
// A long word without spaces may only be cut BETWEEN clusters, never inside one, or the shaping would break.

const VIRAMA = '\u0ACD';
const ZERO_WIDTH_JOINER = '\u200D';
const COMBINING = /^[\p{M}\u200C\u200D]$/u;
const ELLIPSIS = '...';

/** Splits text into clusters that must stay together: a letter with its signs, and a conjunct (after a virama the next letter joins). */
export function splitClusters(text: string): string[] {
  const clusters: string[] = [];
  for (const character of text) {
    const lastIndex = clusters.length - 1;
    const previous = clusters[lastIndex];
    const joins =
      previous !== undefined &&
      (COMBINING.test(character) || previous.endsWith(VIRAMA) || previous.endsWith(ZERO_WIDTH_JOINER));
    if (previous !== undefined && joins) clusters[lastIndex] = previous + character;
    else clusters.push(character);
  }
  return clusters;
}

/**
 * Wraps `text` into lines no wider than `maxWidth` (as `measure` reports). Words are kept whole when they fit; a word wider
 * than a line is cut between clusters. At most `maxLines` lines are returned: the last one then ends with "..." (plain
 * dots, safe in every font). A single cluster wider than `maxWidth` still gets its own line, so the function always ends.
 * Whitespace (also line breaks) counts as one space. Empty text gives an empty array.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines: number = Number.POSITIVE_INFINITY,
): string[] {
  const fits = (candidate: string): boolean => measure(candidate) <= maxWidth;
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current !== '') lines.push(current);
    if (fits(word)) {
      current = word;
      continue;
    }
    let piece = '';
    for (const cluster of splitClusters(word)) {
      if (piece !== '' && !fits(piece + cluster)) {
        lines.push(piece);
        piece = cluster;
      } else {
        piece += cluster;
      }
    }
    current = piece;
  }
  if (current !== '') lines.push(current);

  const limit = Math.max(1, Math.floor(maxLines));
  if (lines.length <= limit) return lines;
  const kept = lines.slice(0, limit);
  const lastClusters = splitClusters(kept[limit - 1] ?? '');
  while (lastClusters.length > 0 && !fits(lastClusters.join('').trimEnd() + ELLIPSIS)) lastClusters.pop();
  kept[limit - 1] = lastClusters.join('').trimEnd() + ELLIPSIS;
  return kept;
}
