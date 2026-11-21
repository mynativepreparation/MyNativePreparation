// Splits a string into Gujarati runs and Latin runs, because the two scripts come from two font files
// (Noto Sans Gujarati, fontsource subsets: "gujarati" and "latin"). Pure, no library.
//
// A Gujarati run holds Gujarati letters, signs and digits (U+0A80-U+0AFF), the danda marks and the Vedic accents that the
// Gujarati subset carries, the joiners U+200C / U+200D (they must stay inside the word they shape) and the dotted circle.
// EVERYTHING else (letters, digits, spaces, punctuation) is a Latin run, so a space between two Gujarati words belongs to the
// Latin font. Joining all runs again gives back the original string unchanged.

export type Script = 'gujarati' | 'latin';

export interface Run {
  text: string;
  script: Script;
}

export function isGujaratiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0a80 && codePoint <= 0x0aff) ||
    codePoint === 0x0951 ||
    codePoint === 0x0952 ||
    codePoint === 0x0964 ||
    codePoint === 0x0965 ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x25cc
  );
}

export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const char of text) {
    const script: Script = isGujaratiCodePoint(char.codePointAt(0) ?? 0) ? 'gujarati' : 'latin';
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += char;
    else runs.push({ text: char, script });
  }
  return runs;
}
