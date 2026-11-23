import { newId } from '../content/ids';
import type { Block, CourseCard, Question, Test, ValidationResult } from '../content/types';
import { isSafeRelativePath, validateBlocks, validateCourseCard, validateTest } from '../content/validate';

// The editor's working copy of ONE course (P10, DECISIONS Q24). It has exactly the shape of the files in
// `public/content/courses/<id>/` (docs/CONTENT-FORMAT.md): every output of `draftToFiles` passes the validators.
// Pure functions only: no DOM, no network, no storage. IDs are created once and never change.

/** An image kept with the draft. `path` is relative to the course folder, e.g. `images/1.webp`. */
export interface DraftImage {
  path: string;
  mime: string;
  bytes: Uint8Array;
}

export interface CourseDraft {
  course: CourseCard;
  /** Blocks of overview.json (an empty array means "not available"). */
  overview: Block[];
  /** Blocks of content.json (an empty array means "not available"). */
  content: Block[];
  /** test.json; null (or a test without questions) means "not available". */
  test: Test | null;
  images: DraftImage[];
}

/** File path (relative to the course folder) -> JSON text, or raw bytes for images. */
export type DraftFiles = Record<string, string | Uint8Array>;

const MIME_TO_EXT = new Map<string, string>([
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
]);
const EXT_TO_MIME = new Map<string, string>([
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
]);

const IMAGE_DIR = 'images/';

/** A new, empty course. The title stays empty until the developer types one (validateDraft reports it). */
export function createCourseDraft(input: { title?: string; order?: number } = {}): CourseDraft {
  return {
    course: { id: newId('crs'), title: input.title ?? '', order: input.order ?? 1 },
    overview: [],
    content: [],
    test: null,
    images: [],
  };
}

export function newTextBlock(type: 'title' | 'subtitle' | 'text', text: string): Block {
  return { id: newId('blk'), type, text };
}

export function newImageBlock(src: string, alt = ''): Block {
  return { id: newId('blk'), type: 'image', src, alt };
}

export function createTest(questionsPerGame = 5): Test {
  return { id: newId('tst'), questionsPerGame, questions: [] };
}

export function newQuestion(
  text: string,
  options: [string, string, string, string],
  correctIndex: 0 | 1 | 2 | 3,
  explanation?: string,
): Question {
  const q: Question = { id: newId('qst'), text, options, correctIndex };
  if (explanation !== undefined && explanation !== '') q.explanation = explanation;
  return q;
}

/** The next free `images/<n>.<ext>` path for an image of this type, or null when the type is not supported. */
export function nextImagePath(images: readonly DraftImage[], mime: string): string | null {
  const ext = MIME_TO_EXT.get(mime);
  if (ext === undefined) return null;
  const used = new Set(images.map((i) => i.path));
  let n = 1;
  while (used.has(`${IMAGE_DIR}${n}.${ext}`)) n += 1;
  return `${IMAGE_DIR}${n}.${ext}`;
}

// ---- draft -> files -------------------------------------------------------------------------------------------

function orderedBlock(b: Block): Block {
  if (b.type === 'image') return { id: b.id, type: 'image', src: b.src ?? '', alt: b.alt ?? '' };
  // `font` (DECISIONS Q25) is written only when it is set, so files without a font stay exactly as they were.
  return { id: b.id, type: b.type, text: b.text ?? '', ...(b.font !== undefined ? { font: b.font } : {}) };
}

function orderedQuestion(q: Question): Question {
  const out: Question = { id: q.id, text: q.text, options: [...q.options] as Question['options'], correctIndex: q.correctIndex };
  if (q.explanation !== undefined) out.explanation = q.explanation;
  return out;
}

function orderedTest(t: Test): Test {
  return {
    id: t.id,
    ...(t.title !== undefined ? { title: t.title } : {}),
    ...(t.image !== undefined ? { image: t.image } : {}),
    questionsPerGame: t.questionsPerGame,
    questions: t.questions.map(orderedQuestion),
  };
}

function orderedCard(c: CourseCard): CourseCard {
  return {
    id: c.id,
    title: c.title,
    ...(c.description !== undefined ? { description: c.description } : {}),
    ...(c.cover !== undefined ? { cover: c.cover } : {}),
    order: c.order,
  };
}

const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The files of the course folder. Empty optional parts (no blocks, no questions) are left out, because a missing
 * file means "not available" in the app. Images come last, sorted by path, so the output is stable.
 */
export function draftToFiles(draft: CourseDraft): DraftFiles {
  const files: DraftFiles = {};
  files['course.json'] = toJson(orderedCard(draft.course));
  if (draft.overview.length > 0) files['overview.json'] = toJson({ blocks: draft.overview.map(orderedBlock) });
  if (draft.content.length > 0) files['content.json'] = toJson({ blocks: draft.content.map(orderedBlock) });
  if (draft.test !== null && draft.test.questions.length > 0) files['test.json'] = toJson(orderedTest(draft.test));
  const sorted = [...draft.images].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const img of sorted) files[img.path] = img.bytes;
  return files;
}

// ---- files -> draft -------------------------------------------------------------------------------------------

type Parsed = { ok: true; value: unknown } | { ok: false };

function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function asText(value: string | Uint8Array): string {
  return typeof value === 'string' ? value : new TextDecoder().decode(value);
}

/** Reads the files of one course folder (for example loaded from `public/content` or GitHub) into a draft. Checks each file's own shape; `validateDraft` checks the links between files. */
export function draftFromFiles(files: DraftFiles): ValidationResult<CourseDraft> {
  const errors: string[] = [];
  const map = new Map<string, string | Uint8Array>(Object.entries(files));

  const readJson = (name: string): { found: boolean; value: unknown } => {
    const raw = map.get(name);
    if (raw === undefined) return { found: false, value: undefined };
    const parsed = parseJson(asText(raw));
    if (!parsed.ok) {
      errors.push(`${name}: not valid JSON`);
      return { found: true, value: undefined };
    }
    return { found: true, value: parsed.value };
  };
  const addAll = (name: string, list: string[]): void => {
    for (const e of list) errors.push(`${name}: ${e}`);
  };

  let course: CourseCard | null = null;
  const c = readJson('course.json');
  if (!c.found) errors.push('course.json: missing');
  else if (c.value !== undefined) {
    const r = validateCourseCard(c.value);
    if (r.ok) course = r.value;
    else addAll('course.json', r.errors);
  }

  const blocksOf = (name: string): Block[] => {
    const f = readJson(name);
    if (!f.found || f.value === undefined) return [];
    const r = validateBlocks(f.value);
    if (r.ok) return r.value.blocks;
    addAll(name, r.errors);
    return [];
  };
  const overview = blocksOf('overview.json');
  const content = blocksOf('content.json');

  let test: Test | null = null;
  const t = readJson('test.json');
  if (t.found && t.value !== undefined) {
    const r = validateTest(t.value);
    if (r.ok) test = r.value;
    else addAll('test.json', r.errors);
  }

  const images: DraftImage[] = [];
  for (const [path, value] of map) {
    if (!path.startsWith(IMAGE_DIR)) continue;
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const mime = EXT_TO_MIME.get(ext);
    if (!isSafeRelativePath(path) || mime === undefined) {
      errors.push(`${path}: not a supported image file`);
      continue;
    }
    images.push({ path, mime, bytes: typeof value === 'string' ? new TextEncoder().encode(value) : value });
  }
  images.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  if (errors.length > 0 || course === null) return { ok: false, errors: errors.length > 0 ? errors : ['course.json: missing'] };
  return { ok: true, value: { course, overview, content, test, images } };
}

// ---- checks across the whole draft --------------------------------------------------------------------------

/** Full check before Save: every part against the schema, block ids unique across overview + content, and every image path that is used exists in the draft. */
export function validateDraft(draft: CourseDraft): ValidationResult<CourseDraft> {
  const errors: string[] = [];
  const addAll = (name: string, list: string[]): void => {
    for (const e of list) errors.push(`${name}: ${e}`);
  };

  const card = validateCourseCard(draft.course);
  if (!card.ok) addAll('course', card.errors);
  const ov = validateBlocks({ blocks: draft.overview });
  if (!ov.ok) addAll('overview', ov.errors);
  const ct = validateBlocks({ blocks: draft.content });
  if (!ct.ok) addAll('content', ct.errors);
  if (draft.test !== null) {
    const t = validateTest(draft.test);
    if (!t.ok) addAll('test', t.errors);
  }

  const seen = new Set<string>();
  for (const b of [...draft.overview, ...draft.content]) {
    if (seen.has(b.id)) errors.push(`blocks: id "${b.id}" is used in both overview and content or twice`);
    seen.add(b.id);
  }

  const have = new Set<string>();
  for (const img of draft.images) {
    if (!img.path.startsWith(IMAGE_DIR) || !isSafeRelativePath(img.path)) errors.push(`images: unsafe path "${img.path}"`);
    if (have.has(img.path)) errors.push(`images: "${img.path}" is stored twice`);
    have.add(img.path);
  }
  const needs = (where: string, path: string | undefined): void => {
    if (path !== undefined && path !== '' && !have.has(path)) errors.push(`${where}: image "${path}" is not in the draft`);
  };
  needs('course.cover', draft.course.cover);
  draft.overview.forEach((b, i) => {
    if (b.type === 'image') needs(`overview.blocks[${i}]`, b.src);
  });
  draft.content.forEach((b, i) => {
    if (b.type === 'image') needs(`content.blocks[${i}]`, b.src);
  });
  needs('test.image', draft.test?.image);

  return errors.length === 0 ? { ok: true, value: draft } : { ok: false, errors };
}
