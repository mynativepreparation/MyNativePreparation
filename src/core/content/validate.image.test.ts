// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateBlocks } from './validate';

const file = (...blocks: unknown[]) => ({ blocks });
const image = (extra: Record<string, unknown> = {}) => ({
  id: 'blk-aaaa0001',
  type: 'image',
  src: 'images/a.webp',
  alt: 'A picture',
  ...extra,
});

describe('validateBlocks: picture layout (DECISIONS Q26 d)', () => {
  it('an image without align / width / height has none of those keys (old courses stay exactly as they were)', () => {
    const result = validateBlocks(file(image()));
    expect(result).toEqual({ ok: true, value: { blocks: [{ id: 'blk-aaaa0001', type: 'image', src: 'images/a.webp', alt: 'A picture' }] } });
    if (result.ok) {
      const block = result.value.blocks[0];
      expect('align' in block).toBe(false);
      expect('width' in block).toBe(false);
      expect('height' in block).toBe(false);
    }
  });

  it('keeps align, width and height when they are valid', () => {
    const result = validateBlocks(file(image({ align: 'left', width: 40, height: 120 })));
    expect(result).toEqual({
      ok: true,
      value: { blocks: [{ id: 'blk-aaaa0001', type: 'image', src: 'images/a.webp', alt: 'A picture', align: 'left', width: 40, height: 120 }] },
    });
  });

  it.each(['left', 'center', 'right'])('accepts align "%s"', (align) => {
    expect(validateBlocks(file(image({ align }))).ok).toBe(true);
  });

  it.each([['middle'], [''], ['LEFT'], [1], [null], [true], [['left']]])('rejects the align value %j with a path', (align) => {
    expect(validateBlocks(file(image({ align })))).toEqual({
      ok: false,
      errors: ['blocks[0].align: must be one of left, center, right'],
    });
  });

  it.each([[10], [55], [100]])('accepts width %d', (width) => {
    expect(validateBlocks(file(image({ width }))).ok).toBe(true);
  });

  it.each([[9], [101], [0], [-5], [50.5], ['50'], [null], [true], [Number.NaN]])('rejects the width value %j with a path', (width) => {
    expect(validateBlocks(file(image({ width })))).toEqual({
      ok: false,
      errors: ['blocks[0].width: must be a whole number from 10 to 100 (percent)'],
    });
  });

  it.each([[10], [100], [300]])('accepts height %d', (height) => {
    expect(validateBlocks(file(image({ height }))).ok).toBe(true);
  });

  it.each([[9], [301], [0], [-5], [99.5], ['100'], [null], [true]])('rejects the height value %j with a path', (height) => {
    expect(validateBlocks(file(image({ height })))).toEqual({
      ok: false,
      errors: ['blocks[0].height: must be a whole number from 10 to 300 (percent)'],
    });
  });

  it('reports every wrong picture field of one block, in a fixed order', () => {
    expect(validateBlocks(file(image({ align: 'up', width: 5, height: 999 })))).toEqual({
      ok: false,
      errors: [
        'blocks[0].align: must be one of left, center, right',
        'blocks[0].width: must be a whole number from 10 to 100 (percent)',
        'blocks[0].height: must be a whole number from 10 to 300 (percent)',
      ],
    });
  });

  it('points at the right block', () => {
    const result = validateBlocks(file(image(), image({ id: 'blk-aaaa0002', width: 500 })));
    expect(result).toEqual({
      ok: false,
      errors: ['blocks[1].width: must be a whole number from 10 to 100 (percent)'],
    });
  });

  it.each(['align', 'width', 'height'])('a text block cannot have %s', (key) => {
    const value = key === 'align' ? 'left' : 50;
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'text', text: 'X', [key]: value }));
    expect(result).toEqual({ ok: false, errors: [`blocks[0].${key}: only image blocks can have ${key}`] });
  });

  it('a title block cannot have picture fields either', () => {
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'title', text: 'T', width: 50 }));
    expect(result).toEqual({ ok: false, errors: ['blocks[0].width: only image blocks can have width'] });
  });
});
