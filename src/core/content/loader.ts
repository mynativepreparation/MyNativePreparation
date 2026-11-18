import { isId } from './ids';
import type {
  Block,
  BlockFile,
  CourseCard,
  Manifest,
  SectionState,
  Test,
  ValidationResult,
} from './types';
import { validateBlocks, validateCourseCard, validateManifest, validateTest } from './validate';

// Loads the public JSON content (manifest + course files) and turns it into safe typed objects.
// Rules (P03 plan, SPEC C3): a missing or empty OPTIONAL section is "empty" (never an error);
// broken JSON or a file that fails validation is "invalid" with readable errors. Nothing here throws.

export type ManifestResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; reason: 'unavailable' | 'invalid'; errors: string[] };

export interface LoadedCourse {
  /** `empty` means course.json is missing; screens treat that course as not available. */
  card: SectionState<CourseCard>;
  overview: SectionState<Block[]>;
  content: SectionState<Block[]>;
  test: SectionState<Test>;
}

type Fetched =
  | { kind: 'ok'; data: unknown }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'badJson'; reason: string };

/** URL of a file under the content root, e.g. `manifest.json` or `courses/<id>/course.json`. */
export function contentUrl(path: string): string {
  return `${import.meta.env.BASE_URL}content/${path}`;
}

async function fetchJson(path: string): Promise<Fetched> {
  let response: Response;
  try {
    response = await fetch(contentUrl(path));
  } catch {
    return { kind: 'unavailable', reason: `${path}: network error` };
  }
  if (!response.ok) return { kind: 'unavailable', reason: `${path}: HTTP ${response.status}` };
  // A dev server or a single-page host may answer a missing file with index.html and status 200.
  if ((response.headers.get('content-type') ?? '').includes('text/html')) {
    return { kind: 'unavailable', reason: `${path}: not found (the server sent a web page)` };
  }
  try {
    return { kind: 'ok', data: (await response.json()) as unknown };
  } catch {
    return { kind: 'badJson', reason: `${path}: not valid JSON` };
  }
}

function toSection<V, T>(
  fetched: Fetched,
  path: string,
  validate: (input: unknown) => ValidationResult<V>,
  select: (value: V) => T | null,
): SectionState<T> {
  if (fetched.kind === 'unavailable') return { state: 'empty' };
  if (fetched.kind === 'badJson') return { state: 'invalid', errors: [fetched.reason] };
  const result = validate(fetched.data);
  if (!result.ok) return { state: 'invalid', errors: result.errors.map((e) => `${path}: ${e}`) };
  const selected = select(result.value);
  return selected === null ? { state: 'empty' } : { state: 'ready', value: selected };
}

/** Loads and validates `manifest.json`. A missing manifest is an error result, not an exception. */
export async function loadManifest(): Promise<ManifestResult> {
  const fetched = await fetchJson('manifest.json');
  if (fetched.kind === 'unavailable') return { ok: false, reason: 'unavailable', errors: [fetched.reason] };
  if (fetched.kind === 'badJson') return { ok: false, reason: 'invalid', errors: [fetched.reason] };
  const result = validateManifest(fetched.data);
  if (!result.ok) {
    return { ok: false, reason: 'invalid', errors: result.errors.map((e) => `manifest.json: ${e}`) };
  }
  return { ok: true, manifest: result.value };
}

const EMPTY = { state: 'empty' } as const;

/** Loads one course folder. Every section is `ready`, `empty` or `invalid`; the call itself never rejects. */
export async function loadCourse(courseId: string): Promise<LoadedCourse> {
  const requested: string = courseId; // isId() is a type guard; keep a plain string for the message below
  if (!isId('crs', courseId)) {
    return {
      card: { state: 'invalid', errors: [`courseId: "${requested}" is not a valid course id`] },
      overview: EMPTY,
      content: EMPTY,
      test: EMPTY,
    };
  }
  const dir = `courses/${courseId}`;
  const [card, overview, content, test] = await Promise.all([
    fetchJson(`${dir}/course.json`),
    fetchJson(`${dir}/overview.json`),
    fetchJson(`${dir}/content.json`),
    fetchJson(`${dir}/test.json`),
  ]);

  const blocks = (file: BlockFile) => (file.blocks.length > 0 ? file.blocks : null);
  return {
    card: toSection(card, `${dir}/course.json`, validateCourseCard, (c) => c),
    overview: toSection(overview, `${dir}/overview.json`, validateBlocks, blocks),
    content: toSection(content, `${dir}/content.json`, validateBlocks, blocks),
    test: toSection(test, `${dir}/test.json`, validateTest, (t) => (t.questions.length > 0 ? t : null)),
  };
}
