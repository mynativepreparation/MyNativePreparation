import { describe, expect, it } from 'vitest';
import { IMAGE_HEIGHT_RANGE, IMAGE_WIDTH_RANGE, type ImageAlign } from '../content/types';
import { alignFromPointer, dragHeight, dragWidth, widthHandleSide } from './pictureDrag';

// P10 T11o step O4a: the numbers behind the drag handles of the picture card (pure, no DOM).

describe('widthHandleSide', () => {
  it('a picture on the right keeps its right edge, so its handle is on the left', () => {
    expect(widthHandleSide('right')).toBe('left');
  });

  it.each([['left'], ['center'], [undefined]] as [ImageAlign | undefined][])(
    'a picture with align %s has its handle on the right edge',
    (align) => {
      expect(widthHandleSide(align)).toBe('right');
    },
  );
});

describe('dragWidth', () => {
  it('a picture on the left grows by the pointer movement', () => {
    expect(dragWidth({ startPercent: 50, deltaPx: 100, stagePx: 400, align: 'left' })).toBe(75);
    expect(dragWidth({ startPercent: 50, deltaPx: -100, stagePx: 400, align: 'left' })).toBe(25);
  });

  it('a picture on the right grows when the pointer moves the other way', () => {
    expect(dragWidth({ startPercent: 50, deltaPx: -100, stagePx: 400, align: 'right' })).toBe(75);
    expect(dragWidth({ startPercent: 50, deltaPx: 100, stagePx: 400, align: 'right' })).toBe(25);
  });

  it.each([['center'], [undefined]] as [ImageAlign | undefined][])(
    'a picture with align %s grows to both sides, so by twice the movement',
    (align) => {
      expect(dragWidth({ startPercent: 50, deltaPx: 40, stagePx: 400, align })).toBe(70);
      expect(dragWidth({ startPercent: 50, deltaPx: -40, stagePx: 400, align })).toBe(30);
    },
  );

  it('no movement keeps the width', () => {
    for (const align of ['left', 'center', 'right', undefined] as (ImageAlign | undefined)[]) {
      expect(dragWidth({ startPercent: 55, deltaPx: 0, stagePx: 400, align })).toBe(55);
    }
  });

  it('never goes outside the allowed width range', () => {
    expect(dragWidth({ startPercent: 90, deltaPx: 200, stagePx: 400, align: 'left' })).toBe(IMAGE_WIDTH_RANGE.max);
    expect(dragWidth({ startPercent: 50, deltaPx: 100, stagePx: 400, align: undefined })).toBe(IMAGE_WIDTH_RANGE.max);
    expect(dragWidth({ startPercent: 50, deltaPx: -1000, stagePx: 400, align: 'left' })).toBe(IMAGE_WIDTH_RANGE.min);
    expect(dragWidth({ startPercent: 50, deltaPx: -100, stagePx: 400, align: undefined })).toBe(IMAGE_WIDTH_RANGE.min);
  });

  it('rounds to a whole percent', () => {
    expect(dragWidth({ startPercent: 33, deltaPx: 1, stagePx: 300, align: 'left' })).toBe(33); // 33.33
    expect(dragWidth({ startPercent: 33, deltaPx: 2, stagePx: 300, align: 'left' })).toBe(34); // 33.67
  });

  it.each([0, -50, Number.NaN])('keeps the starting width when the column width is %s', (stagePx) => {
    expect(dragWidth({ startPercent: 60, deltaPx: 100, stagePx, align: 'left' })).toBe(60);
  });

  it('a start value outside the range is brought back into it', () => {
    expect(dragWidth({ startPercent: 500, deltaPx: 0, stagePx: 0, align: 'left' })).toBe(IMAGE_WIDTH_RANGE.max);
    expect(dragWidth({ startPercent: -5, deltaPx: 0, stagePx: 0, align: 'left' })).toBe(IMAGE_WIDTH_RANGE.min);
  });
});

describe('dragHeight', () => {
  it('the picture grows by the same share as its height on the screen', () => {
    expect(dragHeight({ startPercent: 100, startPx: 200, deltaPx: 100 })).toBe(150);
    expect(dragHeight({ startPercent: 100, startPx: 200, deltaPx: -100 })).toBe(50);
    expect(dragHeight({ startPercent: 50, startPx: 200, deltaPx: 100 })).toBe(75);
  });

  it('no movement keeps the height', () => {
    expect(dragHeight({ startPercent: 80, startPx: 250, deltaPx: 0 })).toBe(80);
  });

  it('never goes outside the allowed height range', () => {
    expect(dragHeight({ startPercent: 100, startPx: 200, deltaPx: 5000 })).toBe(IMAGE_HEIGHT_RANGE.max);
    expect(dragHeight({ startPercent: 100, startPx: 200, deltaPx: -190 })).toBe(IMAGE_HEIGHT_RANGE.min);
    expect(dragHeight({ startPercent: 100, startPx: 200, deltaPx: -5000 })).toBe(IMAGE_HEIGHT_RANGE.min);
  });

  it('rounds to a whole percent', () => {
    expect(dragHeight({ startPercent: 100, startPx: 300, deltaPx: 1 })).toBe(100); // 100.33
    expect(dragHeight({ startPercent: 100, startPx: 300, deltaPx: 2 })).toBe(101); // 100.67
  });

  it.each([0, -20, Number.NaN])('keeps the starting height when the picture height is %s px', (startPx) => {
    expect(dragHeight({ startPercent: 120, startPx, deltaPx: 50 })).toBe(120);
  });

  it('a start value outside the range is brought back into it', () => {
    expect(dragHeight({ startPercent: 900, startPx: 0, deltaPx: 0 })).toBe(IMAGE_HEIGHT_RANGE.max);
    expect(dragHeight({ startPercent: 1, startPx: 0, deltaPx: 0 })).toBe(IMAGE_HEIGHT_RANGE.min);
  });
});

describe('alignFromPointer', () => {
  const stage = { stageLeft: 100, stagePx: 300 };

  it('the left third of the column is left, the middle third is centre, the right third is right', () => {
    expect(alignFromPointer({ ...stage, pointerX: 120 })).toBe('left');
    expect(alignFromPointer({ ...stage, pointerX: 250 })).toBe('center');
    expect(alignFromPointer({ ...stage, pointerX: 380 })).toBe('right');
  });

  it('a pointer outside the column counts as the nearest side', () => {
    expect(alignFromPointer({ ...stage, pointerX: -500 })).toBe('left');
    expect(alignFromPointer({ ...stage, pointerX: 5000 })).toBe('right');
  });

  it.each([0, -10, Number.NaN])('is centre when the column width is %s', (stagePx) => {
    expect(alignFromPointer({ stageLeft: 0, stagePx, pointerX: 10 })).toBe('center');
  });
});

describe('every answer is a whole number inside the range, whatever comes in', () => {
  const numbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1e9, -300, -1, 0, 1, 33, 99.5, 400, 1e9];

  it('dragWidth', () => {
    for (const startPercent of numbers) {
      for (const deltaPx of numbers) {
        for (const stagePx of numbers) {
          for (const align of ['left', 'center', 'right', undefined] as (ImageAlign | undefined)[]) {
            const value = dragWidth({ startPercent, deltaPx, stagePx, align });
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(IMAGE_WIDTH_RANGE.min);
            expect(value).toBeLessThanOrEqual(IMAGE_WIDTH_RANGE.max);
          }
        }
      }
    }
  });

  it('dragHeight', () => {
    for (const startPercent of numbers) {
      for (const startPx of numbers) {
        for (const deltaPx of numbers) {
          const value = dragHeight({ startPercent, startPx, deltaPx });
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(IMAGE_HEIGHT_RANGE.min);
          expect(value).toBeLessThanOrEqual(IMAGE_HEIGHT_RANGE.max);
        }
      }
    }
  });
});
