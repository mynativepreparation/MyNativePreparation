import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../../core/content/types';
import { runLayoutCheck } from '../../core/ui';
import { BlockView } from './BlockView';

// P10 T11k: the reader draws colours, sizes, boxes (letter / word / paragraph) and floated pictures (DECISIONS Q26).
// The pure parts have their own tests (inline.span.test.ts, richClasses.test.ts, letters.test.ts, RichText.styles.test.tsx);
// here the whole BlockView is used, as the reader screen uses it.

const COURSE = 'crs_test0001';

function draw(blocks: Block[]): HTMLElement {
  const { container } = render(<BlockView courseId={COURSE} blocks={blocks} />);
  return container.firstElementChild as HTMLElement;
}

function textBlock(text: string): Block {
  return { id: 'blk_aaaaaaa1', type: 'text', text };
}

describe('BlockView: styled titles and subtitles', () => {
  it('a title can have a colour and a size', () => {
    draw([{ id: 'blk_aaaaaaa1', type: 'title', text: '{c=red;s=xl|Hot} title' }]);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Hot title');
    const span = heading.querySelector('span');
    expect(span).toHaveClass('np-ink-red', 'np-size-xl');
    expect(span?.textContent).toBe('Hot');
  });

  it('a subtitle can be blue, in a font of its own', () => {
    draw([{ id: 'blk_aaaaaaa1', type: 'subtitle', text: '{c=blue;f=serif|Part} one' }]);
    const span = screen.getByRole('heading', { level: 3 }).querySelector('span');
    expect(span).toHaveClass('np-ink-blue', 'np-font-serif');
    expect(span?.textContent).toBe('Part');
  });

  it('a box around each letter of a title: one box per letter, spaces stay outside, the text is unchanged', () => {
    draw([{ id: 'blk_aaaaaaa1', type: 'title', text: '{x=l-circle-dark|a b}' }]);
    const heading = screen.getByRole('heading', { level: 2 });
    const boxes = Array.from(heading.querySelectorAll('.np-lbox'));
    expect(boxes.map((box) => box.textContent)).toEqual(['a', 'b']);
    boxes.forEach((box) => expect(box).toHaveClass('np-lbox-circle', 'np-lbox-dark'));
    expect(heading.textContent).toBe('a b');
  });

  it('a title stays one line of text: a leading "- " is not a bullet', () => {
    draw([{ id: 'blk_aaaaaaa1', type: 'title', text: '- one' }]);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('- one');
    expect(heading.querySelector('ul, li')).toBeNull();
  });
});

describe('BlockView: styled text blocks', () => {
  it('colour, word box and size are classes of one span; the words around it stay plain', () => {
    const root = draw([textBlock('Say {c=green;s=l;x=w-pill-dark|this} now')]);
    const span = root.querySelector('p span');
    expect(span).toHaveClass('np-ink-green', 'np-size-l', 'np-wbox', 'np-wbox-pill-dark');
    expect(span?.textContent).toBe('this');
    expect(root.querySelector('p')?.textContent).toBe('Say this now');
  });

  it('letter boxes work together with bold and a colour', () => {
    const root = draw([textBlock('**{c=purple;x=l-square-light|abc}**')]);
    expect(root.querySelectorAll('.np-lbox')).toHaveLength(3);
    expect(root.querySelector('.np-ink-purple > strong')).not.toBeNull(); // the colour span wraps the marks, the letter boxes sit inside
  });

  it('a boxed paragraph has its own class and the next line is a normal paragraph', () => {
    const root = draw([textBlock('{{x=p-dashed}}Boxed line\nNormal line')]);
    const paragraphs = Array.from(root.querySelectorAll('p'));
    expect(paragraphs.map((p) => p.textContent)).toEqual(['Boxed line', 'Normal line']);
    expect(paragraphs[0]).toHaveClass('np-pbox', 'np-pbox-dashed');
    expect(paragraphs[1]).not.toHaveClass('np-pbox');
  });

  it('a boxed bullet list is ONE list with the box class', () => {
    const root = draw([textBlock('{{x=p-leftbar}}- one\n- two')]);
    const lists = root.querySelectorAll('ul');
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveClass('np-block-list', 'np-pbox', 'np-pbox-leftbar');
    expect(Array.from(lists[0].querySelectorAll('li')).map((li) => li.textContent)).toEqual(['one', 'two']);
  });

  it('a style id that is not in the catalog stays plain text, nothing is lost and nothing is drawn', () => {
    const text = 'Keep {c=magenta|this} as it is';
    const root = draw([textBlock(text)]);
    expect(root.querySelector('p')?.textContent).toBe(text);
    expect(root.querySelector('span')).toBeNull();
  });

  it('old text without styles draws exactly as before: no span, no box class', () => {
    const root = draw([textBlock('One\nstill one\n\nTwo **bold**')]);
    expect(root.querySelector('span, .np-lbox, .np-wbox, .np-pbox')).toBeNull();
  });

  it('text that looks like HTML inside a styled span stays text', () => {
    const root = draw([textBlock('{c=red|<img src=x onerror=alert(1)>}')]);
    expect(root.querySelector('img, script')).toBeNull();
    expect(root.querySelector('.np-ink-red')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

function drawFigure(block: Block): HTMLElement {
  const { container } = render(<BlockView courseId={COURSE} blocks={[block]} />);
  return container.querySelector('figure') as HTMLElement;
}

const picture = (extra: Partial<Pick<Block, 'align' | 'width' | 'height'>> = {}): Block => ({
  id: 'blk_bbbbbbb1',
  type: 'image',
  src: 'images/a.png',
  alt: 'A picture',
  ...extra,
});

function showSize(img: HTMLElement, naturalWidth: number, naturalHeight: number): void {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true });
  fireEvent.load(img);
}

describe('BlockView: pictures (align, width, height)', () => {
  it('a picture without align is centred, with no inline width and the old look', () => {
    const figure = drawFigure(picture());
    expect(figure).toHaveClass('np-block-figure', 'np-block-figure--center');
    expect(figure.style.width).toBe('');
    expect(figure.querySelector('img')).not.toHaveClass('np-block-img--fill');
  });

  it.each(['left', 'center', 'right'] as const)('align "%s" is a class of the figure', (align) => {
    expect(drawFigure(picture({ align }))).toHaveClass(`np-block-figure--${align}`);
  });

  it('a left or right picture is not also marked as centred', () => {
    expect(drawFigure(picture({ align: 'left' }))).not.toHaveClass('np-block-figure--center');
    expect(drawFigure(picture({ align: 'right' }))).not.toHaveClass('np-block-figure--center');
  });

  it('a width is a share of the column on the figure, and the picture fills it', () => {
    const figure = drawFigure(picture({ align: 'left', width: 40 }));
    expect(figure.style.width).toBe('40%');
    expect(figure.querySelector('img')).toHaveClass('np-block-img--fill');
  });

  it('the picture comes from the course folder and keeps its alt text', () => {
    const img = drawFigure(picture()).querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain(`courses/${COURSE}/images/a.png`);
    expect(img).toHaveAttribute('alt', 'A picture');
  });

  it('a height stretches the picture only AFTER it has loaded, as a share of its natural height', () => {
    const img = drawFigure(picture({ width: 50, height: 150 })).querySelector('img') as HTMLImageElement;
    expect(img).not.toHaveClass('np-block-img--stretched');

    showSize(img, 400, 200);
    expect(img).toHaveClass('np-block-img--stretched');
    expect(img.style.getPropertyValue('--np-img-aspect')).toBe('400 / 300');
  });

  it('a height smaller than 100 makes the picture shorter, not narrower', () => {
    const img = drawFigure(picture({ height: 50 })).querySelector('img') as HTMLImageElement;
    showSize(img, 400, 200);
    expect(img.style.getPropertyValue('--np-img-aspect')).toBe('400 / 100');
  });

  it('a picture whose size is unknown stays natural', () => {
    const img = drawFigure(picture({ height: 150 })).querySelector('img') as HTMLImageElement;
    fireEvent.load(img); // jsdom has no image sizes: naturalWidth and naturalHeight are 0
    expect(img).not.toHaveClass('np-block-img--stretched');
    expect(img.style.getPropertyValue('--np-img-aspect')).toBe('');
  });

  it('without a height a loaded picture is never stretched', () => {
    const img = drawFigure(picture({ width: 50 })).querySelector('img') as HTMLImageElement;
    showSize(img, 400, 200);
    expect(img).not.toHaveClass('np-block-img--stretched');
  });

  it('a tappable picture sits inside the figure and still reports the opened image', () => {
    const onOpenImage = vi.fn();
    const { container } = render(<BlockView courseId={COURSE} blocks={[picture({ align: 'right', width: 30 })]} onOpenImage={onOpenImage} />);
    const figure = container.querySelector('figure') as HTMLElement;
    expect(figure).toHaveClass('np-block-figure--right');
    const button = figure.querySelector('button.np-block-img-button') as HTMLButtonElement;
    fireEvent.click(button);
    expect(onOpenImage).toHaveBeenCalledTimes(1);
    expect(onOpenImage).toHaveBeenCalledWith({ src: expect.stringContaining(`courses/${COURSE}/images/a.png`), alt: 'A picture' });
  });

  it('a picture without a file name draws nothing', () => {
    const { container } = render(<BlockView courseId={COURSE} blocks={[{ id: 'blk_bbbbbbb1', type: 'image', src: '' }]} />);
    expect(container.querySelector('figure')).toBeNull();
  });
});

// Layout guard at 360 / 768 / 1366 px, same method as BlockView.rich.layout.test.tsx: jsdom has no layout engine, so this proves the wiring
// (ONE checked block list, one child per block, runLayoutCheck finds nothing). Real pixels are judged by the owner in the browser check (T11q).
const LONG_GUJARATI = 'આ ખૂબ લાંબું અને મહત્વપૂર્ણ વાક્ય છે જે નાના મોબાઇલ સ્ક્રીન પર પણ સરસ રીતે વીંટળાવું જોઈએ. '.repeat(6).trim();

const layoutBlocks: Block[] = [
  { id: 'blk_ccccccc1', type: 'title', text: '{c=red;s=xl|પ્રકરણ} ૧' },
  { id: 'blk_ccccccc2', type: 'subtitle', text: '{x=l-circle-dark|પાણી} {c=teal|ચક્ર}', font: 'humanist' },
  { id: 'blk_ccccccc3', type: 'image', src: 'images/a.svg', alt: 'Left picture', align: 'left', width: 40 },
  { id: 'blk_ccccccc4', type: 'text', text: `{c=blue;f=serif|${LONG_GUJARATI}}\n{{x=p-dashed}}${LONG_GUJARATI}` },
  { id: 'blk_ccccccc5', type: 'image', src: 'images/b.svg', alt: 'Right picture', align: 'right', width: 60, height: 120 },
  { id: 'blk_ccccccc6', type: 'text', text: `{{x=p-leftbar}}- ${LONG_GUJARATI}\n- {x=w-box-dark;c=orange|${'Supercalifragilisticexpialidocious'.repeat(3)}}` },
  { id: 'blk_ccccccc7', type: 'image', src: 'images/c.svg', alt: 'Centred picture', width: 100 },
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

describe.each([360, 768, 1366])('styled reader blocks at %i px', (width) => {
  it('one checked block list with one child per block, no sideways scroll, no overlap', () => {
    setWindowWidth(width);
    render(<BlockView courseId={COURSE} blocks={layoutBlocks} />);
    const lists = document.querySelectorAll('[data-np-check]');
    expect(lists).toHaveLength(1);
    expect(lists[0].children).toHaveLength(layoutBlocks.length);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('draws the long coloured Gujarati text, the boxed paragraph, the boxed list and the long boxed word', () => {
    setWindowWidth(width);
    const { container } = render(<BlockView courseId={COURSE} blocks={layoutBlocks} />);
    expect(container.querySelector('.np-ink-blue.np-font-serif')?.textContent).toBe(LONG_GUJARATI);
    expect(container.querySelector('p.np-pbox-dashed')?.textContent).toBe(LONG_GUJARATI);
    expect(container.querySelector('ul.np-pbox-leftbar')).not.toBeNull();
    expect(container.querySelector('.np-wbox-box-dark')?.textContent).toBe('Supercalifragilisticexpialidocious'.repeat(3));
    expect(container.querySelectorAll('figure')).toHaveLength(3);
  });
});
