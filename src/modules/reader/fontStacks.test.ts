// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_CATALOG } from '../../core/content/richStyles';

// P10 T11p: the 16 fonts need three things that must agree: a CSS rule per id (BlockView.css), font faces (core/ui/fonts.css, written by
// scripts/p10-fonts2.ps1) and the font files (public/fonts). Vitest returns an empty string for a CSS import, so the files are read with fs.

function readText(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `.np-font-<id>` -> the family names of its `font-family` list (quotes removed, `var(...)` and generic names as written). */
function stacksOf(css: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const rule of css.matchAll(/\.np-font-([a-z0-9-]+)\s*\{([^}]*)\}/g)) {
    const value = /font-family:\s*([^;]+);/.exec(rule[2]);
    if (value) found.set(rule[1], value[1].split(',').map((name) => name.trim().replace(/^'|'$/g, '')));
  }
  return found;
}

interface Face {
  family: string;
  weight: string;
  file: string;
}

function facesOf(css: string): Face[] {
  const list: Face[] = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*'([^']+)'/.exec(block[1]);
    const weight = /font-weight:\s*([^;]+);/.exec(block[1]);
    const file = /url\('\/fonts\/([^']+)'\)/.exec(block[1]);
    if (family && weight && file) list.push({ family: family[1], weight: weight[1].trim(), file: file[1] });
  }
  return list;
}

const stacks = stacksOf(readText('./BlockView.css'));
const faces = facesOf(readText('../../core/ui/fonts.css'));
const pairs = FONT_CATALOG.map((font): [string, string] => [font.id, font.name]);
/** The 13 families of T11p (the first three are the Gujarati fonts of Q25 and have their own checks elsewhere). */
const newFonts = FONT_CATALOG.slice(3);
const newPairs = newFonts.map((font): [string, string] => [font.id, font.name]);
const MAX_FILE_BYTES = 150 * 1024;

describe('font stacks (BlockView.css)', () => {
  it.each(pairs)('%s: the stack starts with "%s"', (id, name) => {
    expect((stacks.get(id) ?? []).slice(0, 1)).toEqual([name]);
  });

  // the old `serif` stack is a Gujarati font itself and has no Noto Sans Gujarati: the rule is for the 13 new stacks
  it.each(newPairs)('%s ("%s"): Gujarati letters still show (the stack has Noto Sans Gujarati)', (id) => {
    expect(stacks.get(id) ?? []).toContain('Noto Sans Gujarati');
  });
});

describe('font faces (fonts.css)', () => {
  it.each(pairs)('%s: there is a face for "%s"', (_id, name) => {
    expect(faces.some((face) => face.family === name)).toBe(true);
  });

  it('every new family has a regular (400) face', () => {
    const missing = newFonts.filter((font) => !faces.some((face) => face.family === font.name && face.weight === '400'));
    expect(missing.map((font) => font.name)).toEqual([]);
  });

  it('every new family has a bold (700) face, except Kumar One (a display font that only has one weight)', () => {
    const missing = newFonts.filter(
      (font) => font.id !== 'kumar-one' && !faces.some((face) => face.family === font.name && face.weight === '700'),
    );
    expect(missing.map((font) => font.name)).toEqual([]);
    expect(faces.filter((face) => face.family === 'Kumar One').map((face) => face.weight)).toEqual(['400', '400']);
  });

  it('every face of the 13 new families points at a .woff2 file (the first three Gujarati fonts still use .woff files)', () => {
    const names = newFonts.map((font) => font.name);
    expect(faces.filter((face) => names.includes(face.family) && !face.file.endsWith('.woff2')).map((face) => face.file)).toEqual([]);
  });

  it('the file of every face exists in public/fonts and is not larger than 150 KB', () => {
    const problems = faces.flatMap((face) => {
      const path = fileURLToPath(new URL(`../../../public/fonts/${face.file}`, import.meta.url));
      if (!existsSync(path)) return [`${face.file}: missing`];
      return statSync(path).size > MAX_FILE_BYTES ? [`${face.file}: larger than 150 KB`] : [];
    });
    expect(problems).toEqual([]);
  });
});
