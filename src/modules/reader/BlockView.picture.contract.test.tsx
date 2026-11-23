import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IMAGE_HEIGHT_RANGE, IMAGE_WIDTH_RANGE, type Block, type ImageAlign } from '../../core/content/types';
import { BlockView } from './BlockView';

// P10 T11o O5 (1): the editor stores a picture as `align` / `width` / `height` (the picture card, core/admin/chapterSlots.ts); this proves the
// READER draws exactly those numbers: the position class, the width as a share of the column and, once the picture is loaded, the stretched
// height. Reader side only: it imports nothing from modules/admin (boundaries), only the shared ranges the editor clamps to.

const COURSE = 'crs_test0001';
const NATURAL = { width: 400, height: 200 };
const ALIGNS: readonly ImageAlign[] = ['left', 'center', 'right'];

interface Case {
  name: string;
  /** `undefined` = the editor's "Centre": no `align` field at all. */
  align: ImageAlign | undefined;
  width: number;
  height: number;
}

const CASES: Case[] = [
  { name: 'left, middle numbers', align: 'left', width: 40, height: 150 },
  { name: 'right, middle numbers', align: 'right', width: 60, height: 50 },
  { name: 'centred (no align field), middle numbers', align: undefined, width: 70, height: 120 },
  { name: 'left, smallest numbers the editor allows', align: 'left', width: IMAGE_WIDTH_RANGE.min, height: IMAGE_HEIGHT_RANGE.min },
  { name: 'right, biggest numbers the editor allows', align: 'right', width: IMAGE_WIDTH_RANGE.max, height: IMAGE_HEIGHT_RANGE.max },
  { name: 'centred, biggest numbers the editor allows', align: undefined, width: IMAGE_WIDTH_RANGE.max, height: IMAGE_HEIGHT_RANGE.max },
];

function pictureBlock(c: Case): Block {
  return {
    id: 'blk-pic00001',
    type: 'image',
    src: 'images/a.png',
    alt: 'A cat',
    width: c.width,
    height: c.height,
    ...(c.align === undefined ? {} : { align: c.align }),
  };
}

function draw(block: Block) {
  const { container } = render(<BlockView courseId={COURSE} blocks={[block]} />);
  const figure = container.querySelector('figure') as HTMLElement;
  const img = figure.querySelector('img') as HTMLImageElement;
  return { figure, img };
}

function load(img: HTMLImageElement): void {
  Object.defineProperty(img, 'naturalWidth', { value: NATURAL.width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: NATURAL.height, configurable: true });
  fireEvent.load(img);
}

describe('editor numbers -> reader picture', () => {
  it.each(CASES)('$name: position class and width are drawn at once', (c) => {
    const { figure, img } = draw(pictureBlock(c));
    const wanted = c.align ?? 'center';
    expect(figure).toHaveClass('np-block-figure', `np-block-figure--${wanted}`);
    ALIGNS.filter((align) => align !== wanted).forEach((other) => expect(figure).not.toHaveClass(`np-block-figure--${other}`));
    expect(figure.style.width).toBe(`${c.width}%`);
    expect(img).toHaveClass('np-block-img--fill');
  });

  it.each(CASES)('$name: the height is applied as a share of the natural height after the picture has loaded', (c) => {
    const { img } = draw(pictureBlock(c));
    expect(img).not.toHaveClass('np-block-img--stretched'); // the natural size is not known yet: nothing is guessed
    load(img);
    expect(img).toHaveClass('np-block-img--stretched');
    expect(img.style.getPropertyValue('--np-img-aspect')).toBe(`${NATURAL.width} / ${(NATURAL.height * c.height) / 100}`);
  });

  it('a picture without width and height keeps the natural look, whatever its position', () => {
    ALIGNS.forEach((align) => {
      const { figure, img } = draw({ id: 'blk-pic00001', type: 'image', src: 'images/a.png', alt: 'A cat', align });
      expect(figure).toHaveClass(`np-block-figure--${align}`);
      expect(figure.style.width).toBe('');
      expect(img).not.toHaveClass('np-block-img--fill');
      load(img);
      expect(img).not.toHaveClass('np-block-img--stretched');
    });
  });
});
