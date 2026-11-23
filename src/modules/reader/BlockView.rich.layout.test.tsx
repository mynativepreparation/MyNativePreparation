import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Block } from '../../core/content/types';
import { runLayoutCheck } from '../../core/ui';
import { BlockView } from './BlockView';

// P10 T11b: layout guard for formatted text at 360 / 768 / 1366 px, same method as layout.test.tsx.
// jsdom has no layout engine, so this proves the wiring: ONE checked block list, one child per block, and
// `runLayoutCheck` (the function the gallery button runs in a real browser) finds nothing. Real pixels are judged by the owner.
// The CSS wraps long words (`overflow-wrap: anywhere` on `.np-blocks`) and every list item has `min-width: 0`.

const LONG_GUJARATI = 'આ ખૂબ લાંબું અને મહત્વપૂર્ણ વાક્ય છે જે નાના મોબાઇલ સ્ક્રીન પર પણ સરસ રીતે વીંટળાવું જોઈએ. '.repeat(6);

const blocks: Block[] = [
  { id: 'blk_aaaaaaa1', type: 'title', text: 'પ્રકરણ ૧', font: 'serif' },
  { id: 'blk_aaaaaaa2', type: 'subtitle', text: 'પાણીનું ચક્ર', font: 'humanist' },
  { id: 'blk_aaaaaaa3', type: 'text', text: `**${LONG_GUJARATI.trim()}**`, font: 'sans' },
  {
    id: 'blk_aaaaaaa4',
    type: 'text',
    text: `*${LONG_GUJARATI.trim()}* ==${LONG_GUJARATI.trim()}== __${LONG_GUJARATI.trim()}__`,
  },
  {
    id: 'blk_aaaaaaa5',
    type: 'text',
    text: `- ${LONG_GUJARATI.trim()}\n- **${'Supercalifragilisticexpialidocious'.repeat(4)}**\n- ટૂંકો મુદ્દો`,
  },
  { id: 'blk_aaaaaaa6', type: 'image', src: 'images/water-cycle.svg', alt: 'Water cycle drawing' },
];

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('formatted reader text at %i px', (width) => {
  it('one checked block list with one child per block, no sideways scroll, no overlap', () => {
    setWindowWidth(width);
    render(<BlockView courseId="crs_aaaaaaaa" blocks={blocks} />);
    const lists = document.querySelectorAll('[data-np-check]');
    expect(lists).toHaveLength(1);
    expect(lists[0].children).toHaveLength(blocks.length);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('draws the long bold Gujarati sentence, the highlight, the underline and the long bullet word', () => {
    setWindowWidth(width);
    const { container } = render(<BlockView courseId="crs_aaaaaaaa" blocks={blocks} />);
    expect(container.querySelector('strong')?.textContent).toBe(LONG_GUJARATI.trim());
    expect(container.querySelector('mark')?.textContent).toBe(LONG_GUJARATI.trim());
    expect(container.querySelector('u')?.textContent).toBe(LONG_GUJARATI.trim());
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
  });
});
