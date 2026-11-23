// @vitest-environment node
// Pictures of SEVERAL tests (P10 T11r): a picture is kept when any test of the course uses it.
import { describe, expect, it } from 'vitest';
import { createCourseDraft, createTest, type DraftImage } from './model';
import { pruneImages, usedImagePaths } from './pruneImages';

const img = (path: string): DraftImage => ({ path, mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) });

describe('pruneImages with several tests', () => {
  it('keeps the pictures of every test and drops the ones nothing uses', () => {
    const draft = createCourseDraft({ title: 'A' });
    draft.tests = [
      { ...createTest(), image: 'images/1.png' },
      { ...createTest(), image: 'images/3.png' },
      createTest(),
    ];
    draft.images = ['1', '2', '3'].map((n) => img(`images/${n}.png`));
    expect(pruneImages(draft).map((i) => i.path)).toEqual(['images/1.png', 'images/3.png']);
  });

  it('usedImagePaths lists the picture of each test once and skips tests without a picture', () => {
    const draft = createCourseDraft();
    draft.tests = [{ ...createTest(), image: 'images/1.png' }, { ...createTest(), image: 'images/1.png' }, createTest()];
    expect(Array.from(usedImagePaths(draft))).toEqual(['images/1.png']);
  });

  it('a course with no tests keeps only the pictures of the cover and the blocks', () => {
    const draft = createCourseDraft();
    draft.course.cover = 'images/c.png';
    draft.images = [img('images/c.png'), img('images/t.png')];
    expect(pruneImages(draft).map((i) => i.path)).toEqual(['images/c.png']);
  });
});
