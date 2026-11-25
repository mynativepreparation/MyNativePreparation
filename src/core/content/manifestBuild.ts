import { sha256Hex } from './hash';
import { SCHEMA_VERSION, type Manifest, type ManifestCourse } from './types';
import { isSafeRelativePath } from './validate';

// The manifest rule of `scripts/make-manifest.mjs`, as pure code that runs in the browser (P11 T3). The Admin Publish
// button uses it to make the new `manifest.json` that goes into the same commit as the course files.
// - One entry per course folder `courses/<id>/`, with the SHA-256 of every file in it.
// - `version` grows by 1 for a course only when one of its files or its title changed; a new course starts at 1.
// - `generatedAt` changes only when something changed, so building twice from the same input gives the SAME text.
// - File paths are relative to the content root (`courses/<id>/course.json`), exactly like the keys of the manifest.
// Nothing here throws: a problem comes back as `{ ok: false, errors }`.

export interface ManifestInputFile {
  /** Relative to the content root, e.g. `courses/crs-a/course.json`. Files outside `courses/<id>/` are ignored. */
  path: string;
  bytes: Uint8Array;
}

export interface BuildManifestInput {
  files: readonly ManifestInputFile[];
  /** The manifest that is live now (already parsed), or anything else / null when there is none. */
  previous: unknown;
  /** The time to write into `generatedAt` when something changed (an ISO string). */
  now: string;
}

export type BuildManifestResult =
  | {
      ok: true;
      manifest: Manifest;
      /** The exact bytes of `manifest.json` as text: 2-space JSON plus a final newline, like the script writes it. */
      text: string;
      /** True when a course is new / changed / removed (then `generatedAt` is `now`). */
      changed: boolean;
    }
  | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The script sorts full Windows paths, where the separator is "\" (0x5C), not "/" (0x2F). The two orders differ for
// names like `img1.webp` and `img/x.webp`. The committed manifests come from Windows, so the same order is used here.
const windowsKey = (p: string): string => p.split('/').join('\\');
const byWindowsOrder = (a: string, b: string): number => {
  const x = windowsKey(a);
  const y = windowsKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

const hashBytes = (bytes: Uint8Array): Promise<string> => sha256Hex(Uint8Array.from(bytes));

function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** The courses of the old manifest, by id. A broken entry is left out (then the course counts as new). */
function previousCourses(previous: unknown): Map<string, ManifestCourse> {
  const out = new Map<string, ManifestCourse>();
  if (!isRecord(previous) || !Array.isArray(previous.courses)) return out;
  for (const c of previous.courses as unknown[]) {
    if (!isRecord(c) || typeof c.id !== 'string' || typeof c.title !== 'string') continue;
    if (typeof c.version !== 'number' || !Number.isInteger(c.version) || !isRecord(c.files)) continue;
    const files: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.files)) if (typeof v === 'string') files[k] = v;
    out.set(c.id, { id: c.id, title: c.title, version: c.version, files });
  }
  return out;
}

async function build(input: BuildManifestInput): Promise<BuildManifestResult> {
  const errors: string[] = [];

  // Group the files by course folder. Anything that is not `courses/<folder>/<file...>` is ignored.
  const folders = new Map<string, ManifestInputFile[]>();
  const seen = new Set<string>();
  for (const f of input.files) {
    const parts = f.path.split('/');
    if (parts.length < 3 || parts[0] !== 'courses') continue;
    if (!isSafeRelativePath(f.path)) {
      errors.push(`unsafe path: ${f.path}`);
      continue;
    }
    if (seen.has(f.path)) {
      errors.push(`path given twice: ${f.path}`);
      continue;
    }
    seen.add(f.path);
    const folder = parts[1] ?? '';
    folders.set(folder, [...(folders.get(folder) ?? []), f]);
  }

  const old = previousCourses(input.previous);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries: { course: ManifestCourse; order: number }[] = [];
  let changed = false;

  for (const [folder, files] of folders) {
    const cardFile = files.find((f) => f.path === `courses/${folder}/course.json`);
    if (cardFile === undefined) {
      errors.push(`missing course.json in courses/${folder}`);
      continue;
    }
    let card: unknown;
    try {
      card = JSON.parse(decoder.decode(cardFile.bytes));
    } catch {
      errors.push(`course.json is not valid JSON in courses/${folder}`);
      continue;
    }
    if (!isRecord(card) || typeof card.id !== 'string' || typeof card.title !== 'string') {
      errors.push(`course.json needs "id" and "title": courses/${folder}/course.json`);
      continue;
    }
    if (card.id !== folder) {
      errors.push(`folder name "${folder}" must equal the course id "${card.id}"`);
      continue;
    }

    const sorted = files.map((f) => f.path).sort(byWindowsOrder);
    const byPath = new Map(files.map((f) => [f.path, f.bytes]));
    const hashes = await Promise.all(sorted.map((p) => hashBytes(byPath.get(p) ?? new Uint8Array(0))));
    const fileMap: Record<string, string> = {};
    sorted.forEach((p, i) => {
      fileMap[p] = hashes[i] ?? '';
    });

    const before = old.get(card.id);
    let version = 1;
    if (before === undefined) {
      changed = true;
    } else {
      const same = sameFiles(before.files, fileMap) && before.title === card.title;
      version = same ? before.version : before.version + 1;
      if (!same) changed = true;
    }
    entries.push({ course: { id: card.id, title: card.title, version, files: fileMap }, order: Number(card.order) || 0 });
  }

  if (errors.length > 0) return { ok: false, errors };

  entries.sort((a, b) => a.order - b.order || a.course.id.localeCompare(b.course.id));
  const courses = entries.map((e) => e.course);

  // A course that disappeared is a change too (the script compares the number of courses).
  const hadPrevious = isRecord(input.previous);
  if (hadPrevious && courses.length !== old.size) changed = true;
  if (hadPrevious && [...old.keys()].some((id) => !courses.some((c) => c.id === id))) changed = true;

  const previousStamp = isRecord(input.previous) && typeof input.previous.generatedAt === 'string' ? input.previous.generatedAt : '';
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: changed || previousStamp === '' ? input.now : previousStamp,
    courses,
  };
  return { ok: true, manifest, text: `${JSON.stringify(manifest, null, 2)}\n`, changed };
}

/** Builds the new `manifest.json` from the files of all courses and the manifest that is live now. Never throws. */
export async function buildManifest(input: BuildManifestInput): Promise<BuildManifestResult> {
  try {
    return await build(input);
  } catch {
    return { ok: false, errors: ['The manifest could not be built.'] };
  }
}
