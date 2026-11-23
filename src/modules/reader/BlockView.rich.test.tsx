import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Block } from '../../core/content/types';
import { BlockView } from './BlockView';

const textBlock = (id: string, text: string, font?: Block['font']): Block => ({
  id: `blk_${id.padEnd(8, '0')}`,
  type: 'text',
  text,
  ...(font === undefined ? {} : { font }),
});

function draw(blocks: Block[]): HTMLElement {
  const { container } = render(<BlockView courseId="crs_test0001" blocks={blocks} />);
  return container.firstElementChild as HTMLElement;
}

describe('BlockView: formatted text blocks', () => {
  it('shows marks inside a text block as real elements directly under the block', () => {
    const root = draw([textBlock('a', 'Plain **bold** and *italic*.\n\n- one\n- two')]);
    const body = root.querySelector('.np-block-text') as HTMLElement;
    expect(Array.from(body.children).map((c) => c.tagName)).toEqual(['P', 'UL']);
    expect(body.querySelector('strong')?.textContent).toBe('bold');
    expect(body.querySelector('em')?.textContent).toBe('italic');
    expect(Array.from(body.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['one', 'two']);
  });

  it('still shows old plain text exactly as before', () => {
    const root = draw([textBlock('a', 'One\nstill one\n\nTwo')]);
    const paragraphs = Array.from(root.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs).toEqual(['One\nstill one', 'Two']);
    expect(root.querySelector('strong, em, u, mark, ul')).toBeNull();
  });

  it('draws marks in titles and subtitles too (T11k: a title can be bold, coloured and so on)', () => {
    draw([
      { id: 'blk_aaaaaaa1', type: 'title', text: '**Chapter**' },
      { id: 'blk_aaaaaaa2', type: 'subtitle', text: '*Part*' },
    ]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Chapter');
    expect(screen.getByRole('heading', { level: 2 }).querySelector('strong')?.textContent).toBe('Chapter');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Part');
    expect(screen.getByRole('heading', { level: 3 }).querySelector('em')?.textContent).toBe('Part');
  });
});

describe('BlockView: font types', () => {
  it.each(['sans', 'serif', 'humanist'] as const)('a text block with font "%s" gets the matching np-font class', (font) => {
    const root = draw([textBlock('a', 'Text', font)]);
    expect(root.querySelector('.np-block-text')).toHaveClass(`np-font-${font}`);
  });

  it('a title and a subtitle can have a font too', () => {
    draw([
      { id: 'blk_aaaaaaa1', type: 'title', text: 'Title', font: 'serif' },
      { id: 'blk_aaaaaaa2', type: 'subtitle', text: 'Subtitle', font: 'humanist' },
    ]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('np-block-title', 'np-font-serif');
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('np-block-subtitle', 'np-font-humanist');
  });

  it('a block without font keeps the app font (no np-font class)', () => {
    const root = draw([textBlock('a', 'Text'), { id: 'blk_aaaaaaa2', type: 'title', text: 'Title' }]);
    expect(root.querySelector('[class*="np-font-"]')).toBeNull();
  });

  it('every font class is defined in the stylesheet with the planned font names and a fallback', () => {
    const css = readFileSync(join('src', 'modules', 'reader', 'BlockView.css'), 'utf8');
    expect(css).toMatch(/\.np-font-sans\s*\{[^}]*Noto Sans Gujarati[^}]*var\(--np-font-sans\)/);
    expect(css).toMatch(/\.np-font-serif\s*\{[^}]*Noto Serif Gujarati[^}]*serif/);
    expect(css).toMatch(/\.np-font-humanist\s*\{[^}]*Hind Vadodara[^}]*Noto Sans Gujarati/);
  });

  it('the highlight uses a theme colour (tokens only), not a fixed one', () => {
    const css = readFileSync(join('src', 'modules', 'reader', 'BlockView.css'), 'utf8');
    expect(css).toMatch(/\.np-mark\s*\{[^}]*var\(--np-color-star\)/);
  });
});

describe('BlockView: never HTML', () => {
  it('the reader source never uses innerHTML or dangerouslySetInnerHTML', () => {
    for (const file of ['BlockView.tsx', 'RichText.tsx']) {
      const source = readFileSync(join('src', 'modules', 'reader', file), 'utf8');
      expect(source, file).not.toContain('innerHTML');
    }
  });

  it('text that looks like HTML or script stays text, with or without marks', () => {
    const root = draw([textBlock('a', '<img src=x onerror=alert(1)> **<b>bold</b>**')]);
    expect(root.querySelector('img, b, script')).toBeNull();
    expect(root.querySelector('strong')?.textContent).toBe('<b>bold</b>');
  });
});
