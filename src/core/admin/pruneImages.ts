import type { CourseDraft, DraftImage } from './model';

// Before a draft is stored, pictures that nothing uses any more (a replaced or removed picture) are dropped (P10 T7(d)).
// A picture is used when the cover, a picture block of the overview or the content, or the image of any test points at its path.
// Pure: returns a new list in the old order and never changes the draft.

export function usedImagePaths(draft: Pick<CourseDraft, 'course' | 'overview' | 'content' | 'tests'>): Set<string> {
  const used = new Set<string>();
  const add = (path: string | undefined): void => {
    if (path !== undefined && path !== '') used.add(path);
  };
  add(draft.course.cover);
  for (const b of [...draft.overview, ...draft.content]) {
    if (b.type === 'image') add(b.src);
  }
  for (const test of draft.tests) add(test.image);
  return used;
}

export function pruneImages(draft: CourseDraft): DraftImage[] {
  const used = usedImagePaths(draft);
  return draft.images.filter((img) => used.has(img.path));
}
