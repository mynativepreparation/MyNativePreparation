// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FONT_KINDS } from './types';
import { validateBlocks } from './validate';

// The error text lists the allowed fonts; since P10 T11p there are 16 of them, so the tests take the list from FONT_KINDS (fontKinds.test.ts covers the list itself).
const ALLOWED = FONT_KINDS.join(', ');

const file = (...blocks: unknown[]) => ({ blocks });

describe('validateBlocks: font (DECISIONS Q25)', () => {
  it.each(['sans', 'serif', 'humanist'])('accepts font "%s" on text, subtitle and title blocks and keeps it', (font) => {
    const result = validateBlocks(
      file(
        { id: 'blk-aaaa0001', type: 'title', text: 'T', font },
        { id: 'blk-aaaa0002', type: 'subtitle', text: 'S', font },
        { id: 'blk-aaaa0003', type: 'text', text: 'X', font },
      ),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        blocks: [
          { id: 'blk-aaaa0001', type: 'title', text: 'T', font },
          { id: 'blk-aaaa0002', type: 'subtitle', text: 'S', font },
          { id: 'blk-aaaa0003', type: 'text', text: 'X', font },
        ],
      },
    });
  });

  it('a block without a font has no font key (old courses stay exactly as they were)', () => {
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'text', text: 'X' }));
    expect(result).toEqual({ ok: true, value: { blocks: [{ id: 'blk-aaaa0001', type: 'text', text: 'X' }] } });
    if (result.ok) expect('font' in result.value.blocks[0]).toBe(false);
  });

  it.each([['comic'], [''], ['SANS'], [3], [null], [true], [['serif']]])('rejects the font value %j with a path', (font) => {
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'text', text: 'X', font }));
    expect(result).toEqual({ ok: false, errors: [`blocks[0].font: must be one of ${ALLOWED}`] });
  });

  it('points at the right block', () => {
    const result = validateBlocks(
      file({ id: 'blk-aaaa0001', type: 'text', text: 'X' }, { id: 'blk-aaaa0002', type: 'text', text: 'Y', font: 'nope' }),
    );
    expect(result).toEqual({ ok: false, errors: [`blocks[1].font: must be one of ${ALLOWED}`] });
  });

  it('an image block cannot have a font', () => {
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'image', src: 'images/a.webp', alt: '', font: 'sans' }));
    expect(result).toEqual({ ok: false, errors: ['blocks[0].font: only title, subtitle and text blocks can have a font'] });
  });

  it('inline marks in the text are plain text for the validator (nothing to check there)', () => {
    const result = validateBlocks(file({ id: 'blk-aaaa0001', type: 'text', text: '**bold** and *italic*\n- item' }));
    expect(result.ok).toBe(true);
  });
});
