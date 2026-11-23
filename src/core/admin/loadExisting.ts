import { contentUrl, loadCourse, loadManifest, type LoadedCourse, type ManifestResult } from '../content/loader';
import { draftFromFiles, type CourseDraft, type DraftFiles } from './model';

// Loads a PUBLISHED course (public/content) into an editor draft (P10 T9(b), SPEC D6 "Edit"). It reads only: nothing is written
// anywhere. Course files come through `loader.ts` (already validated), pictures are fetched as bytes, and `draftFromFiles` builds
// the draft (and checks it once more). Nothing here throws; problems come back as a code the screen turns into a friendly text.

export interface PublishedCourse {
  id: string;
  title: string;
}

export type ListResult = { ok: true; courses: PublishedCourse[] } | { ok: false };

export type LoadCode = 'unavailable' | 'invalid' | 'image';
export type LoadResult = { ok: true; draft: CourseDraft } | { ok: false; code: LoadCode; path?: string };

/** What the functions need from the outside; tests pass fakes. */
export interface PublishedDeps {
  loadManifest: () => Promise<ManifestResult>;
  loadCourse: (id: string) => Promise<LoadedCourse>;
  fetchBytes: (url: string) => Promise<Uint8Array | null>;
  contentUrl: (path: string) => string;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    // A host may answer a missing file with a web page and status 200.
    if ((response.headers.get('content-type') ?? '').includes('text/html')) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export const defaultPublishedDeps: PublishedDeps = { loadManifest, loadCourse, fetchBytes, contentUrl };

/** The courses named in the published manifest, in manifest order. */
export async function listPublished(deps: PublishedDeps = defaultPublishedDeps): Promise<ListResult> {
  try {
    const result = await deps.loadManifest();
    if (!result.ok) return { ok: false };
    return { ok: true, courses: result.manifest.courses.map((c) => ({ id: c.id, title: c.title })) };
  } catch {
    return { ok: false };
  }
}

export async function loadPublishedDraft(courseId: string, deps: PublishedDeps = defaultPublishedDeps): Promise<LoadResult> {
  let loaded: LoadedCourse;
  try {
    loaded = await deps.loadCourse(courseId);
  } catch {
    return { ok: false, code: 'unavailable' };
  }
  if (loaded.card.state === 'empty') return { ok: false, code: 'unavailable' };
  if (loaded.card.state === 'invalid') return { ok: false, code: 'invalid' };
  if (loaded.overview.state === 'invalid' || loaded.content.state === 'invalid' || loaded.test.state === 'invalid') {
    return { ok: false, code: 'invalid' };
  }

  const card = loaded.card.value;
  const overview = loaded.overview.state === 'ready' ? loaded.overview.value : [];
  const content = loaded.content.state === 'ready' ? loaded.content.value : [];
  const test = loaded.test.state === 'ready' ? loaded.test.value : null;

  const json = (value: unknown): string => JSON.stringify(value);
  const files: DraftFiles = { 'course.json': json(card) };
  if (overview.length > 0) files['overview.json'] = json({ blocks: overview });
  if (content.length > 0) files['content.json'] = json({ blocks: content });
  if (test !== null) files['test.json'] = json(test);

  // Every picture the course uses, once each.
  const paths = new Set<string>();
  if (card.cover) paths.add(card.cover);
  for (const block of [...overview, ...content]) {
    if (block.type === 'image' && block.src) paths.add(block.src);
  }
  if (test?.image) paths.add(test.image);

  for (const path of paths) {
    const bytes = await deps.fetchBytes(deps.contentUrl(`courses/${card.id}/${path}`));
    if (bytes === null) return { ok: false, code: 'image', path };
    files[path] = bytes;
  }

  const draft = draftFromFiles(files);
  return draft.ok ? { ok: true, draft: draft.value } : { ok: false, code: 'invalid' };
}
