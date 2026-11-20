// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for a bug found in the owner's visual check (P06 T8): the full-screen viewer opened with all buttons
// but a blank picture, because the sample SVG has only a viewBox (no width/height) and collapsed to 0 x 0 inside the
// library's `fit-content` boxes. jsdom has no layout, so this only guards the CSS rules that fixed it.
// The file is read with fs: Vitest returns an empty string for a CSS import, even with `?raw`.
const css = readFileSync(fileURLToPath(new URL('./ImageViewer.css', import.meta.url)), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" is missing`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('ImageViewer.css', () => {
  it('gives the opened picture an explicit size, so an SVG without width and height is not 0 x 0', () => {
    const img = rule('.np-viewer .np-viewer-img');
    expect(img).toMatch(/(^|\s)width:\s*100%/);
    expect(img).toMatch(/(^|\s)height:\s*100%/);
    expect(img).toMatch(/object-fit:\s*contain/);
  });

  it('makes the stage and the content fill the screen, with selectors that beat the library defaults', () => {
    expect(rule('.np-viewer .np-viewer-stage')).toMatch(/flex:\s*1/);
    const content = rule('.np-viewer .np-viewer-content');
    expect(content).toMatch(/(^|\s)width:\s*100%/);
    expect(content).toMatch(/(^|\s)height:\s*100%/);
  });
});
