// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCourseDraft, createTest, newImageBlock, newTextBlock, type DraftImage } from './model';
import { pruneImages, usedImagePaths } from './pruneImages';

const img = (path: string): DraftImage => ({ path, mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) });

describe('pruneImages', () => {
  it('keeps pictures used by the cover, the overview, the content and the test', () => {
    const draft = createCourseDraft({ title: 'A' });
    draft.course.cover = 'images/1.png';
    draft.overview = [newImageBlock('images/2.png')];
    draft.content = [newTextBlock('text', 'x'), newImageBlock('images/3.png')];
    draft.tests = [{ ...createTest(), image: 'images/4.png' }];
    draft.images = ['1', '2', '3', '4'].map((n) => img(`images/${n}.png`));
    expect(pruneImages(draft).map((i) => i.path)).toEqual(['images/1.png', 'images/2.png', 'images/3.png', 'images/4.png']);
  });

  it('drops pictures nothing points at and keeps the order', () => {
    const draft = createCourseDraft();
    draft.content = [newImageBlock('images/5.png'), newImageBlock('images/2.png')];
    draft.images = ['2', '3', '5'].map((n) => img(`images/${n}.png`));
    expect(pruneImages(draft).map((i) => i.path)).toEqual(['images/2.png', 'images/5.png']);
  });

  it('changes nothing in the draft and returns an empty list when nothing is used', () => {
    const draft = createCourseDraft();
    draft.images = [img('images/1.png')];
    expect(pruneImages(draft)).toEqual([]);
    expect(draft.images.map((i) => i.path)).toEqual(['images/1.png']);
  });

  it('ignores empty paths and text blocks', () => {
    const draft = createCourseDraft();
    draft.course.cover = '';
    draft.overview = [newTextBlock('text', 'images/1.png')];
    expect(Array.from(usedImagePaths(draft))).toEqual([]);
  });
});
