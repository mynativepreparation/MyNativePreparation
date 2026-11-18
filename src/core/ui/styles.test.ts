import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Style rules of the design system (P02 acceptance: no hard-coded colors, motion only from tokens).
const cssFiles = (readdirSync('src', { recursive: true }) as string[])
  .filter((f) => f.endsWith('.css'))
  .map((f) => join('src', f));

function read(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // drop comments
}

describe('component CSS rules', () => {
  it('finds the css files', () => {
    expect(cssFiles.length).toBeGreaterThan(10);
  });

  it('has no hard-coded hex colors in any css file', () => {
    const offenders = cssFiles.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('uses motion tokens, no raw durations (only tokens.css and the reduced-motion reset may)', () => {
    const offenders = cssFiles
      .filter((f) => !/tokens\.css$|base\.css$/.test(f))
      .filter((f) => /\d(ms|s)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('turns animation off for prefers-reduced-motion', () => {
    const base = read(join('src', 'core', 'ui', 'base.css'));
    expect(base).toContain('prefers-reduced-motion: reduce');
    expect(base).toContain('animation-duration');
    expect(base).toContain('transition-duration');
  });
});
