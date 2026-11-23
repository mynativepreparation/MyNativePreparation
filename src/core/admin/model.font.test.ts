// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCourseDraft, draftFromFiles, draftToFiles, newImageBlock, newTextBlock, validateDraft } from './model';

// The font type of a block (DECISIONS Q25) must reach the files that are published, and must come back when a file is loaded.

const txt = (v: string | Uint8Array | undefined): string => (typeof v === 'string' ? v : '');

function draftWithFonts() {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [
    { ...newTextBlock('title', 'Heading'), font: 'humanist' },
    { ...newTextBlock('subtitle', 'Sub'), font: 'serif' },
    { ...newTextBlock('text', 'Plain'), font: 'serif' },
    newTextBlock('text', 'No font'),
    newImageBlock('images/1.png', 'Map'),
  ];
  draft.images = [{ path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }];
  return draft;
}

describe('draftToFiles and the block font', () => {
  it('writes the font of title, subtitle and text blocks, and nothing for the others', () => {
    const files = draftToFiles(draftWithFonts());
    const parsed = JSON.parse(txt(files['content.json'])) as { blocks: Record<string, unknown>[] };
    expect(parsed.blocks.map((b) => b['font'])).toEqual(['humanist', 'serif', 'serif', undefined, undefined]);
    expect(parsed.blocks.map((b) => 'font' in b)).toEqual([true, true, true, false, false]);
  });

  it('keeps the file exactly as before when no block has a font', () => {
    const draft = createCourseDraft({ title: 'Maths' });
    draft.overview = [newTextBlock('text', 'Hello')];
    const parsed = JSON.parse(txt(draftToFiles(draft)['overview.json'])) as { blocks: Record<string, unknown>[] };
    expect(parsed.blocks.map((b) => Object.keys(b))).toEqual([['id', 'type', 'text']]);
  });

  it('gives a draft that still passes the full check', () => {
    expect(validateDraft(draftWithFonts()).ok).toBe(true);
  });

  it('brings the fonts back when the files are loaded again', () => {
    const draft = draftWithFonts();
    const result = draftFromFiles(draftToFiles(draft));
    expect(result.ok).toBe(true);
    const loaded = result.ok ? result.value : null;
    expect(loaded === null ? [] : loaded.content.map((b) => b.font)).toEqual(['humanist', 'serif', 'serif', undefined, undefined]);
    expect(loaded === null ? [] : loaded.content.map((b) => b.id)).toEqual(draft.content.map((b) => b.id));
  });
});
