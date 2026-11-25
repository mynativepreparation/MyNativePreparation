import { buildManifest, type ManifestInputFile } from '../content/manifestBuild';
import { SCHEMA_VERSION } from '../content/types';
import { isSafeRelativePath } from '../content/validate';
import { CONTENT_PREFIX, MAX_COMMIT_BYTES, type CommitUpsert } from './githubWrite';
import { draftToFiles, validateDraft, type CourseDraft } from './model';

// The PUBLISH PLAN (P11 T4): what one Publish / Unpublish commit has to carry. Pure: no network, no storage, no clock (the time is given).
// Input = the draft (or the course id) and the manifest that is live now; output = the files to upload, the files to delete (repo paths,
// ready for `commitFiles`) and the new `manifest.json` text.
// - Only the files of THIS course are looked at. Every other entry of the live manifest is copied as it is, in its place; a new course goes last.
//   (`manifestBuild` hashes every course it lists, and the Admin has only this one course in memory, so it is asked about this course alone.)
// - A file whose SHA-256 equals the one in the live manifest is not uploaded; a file the live manifest lists for this course but the draft no
//   longer has (an unused image) is deleted. Nothing outside `courses/<id>/` is ever deleted.
// - `remoteManifest` = `null` / `undefined` means "there is no manifest.json yet" and nothing else. A failed download must stop BEFORE planning:
//   planning with null would drop every other course from the manifest.
// Nothing here throws: a problem comes back as `{ ok: false, code, errors }`.

/** One JSON file of a course may be at most 1 MB, one picture at most 500 KB, one publish at most `MAX_COMMIT_BYTES`. */
export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 500 * 1024;

const MANIFEST_PATH = 'manifest.json';
const encoder = new TextEncoder();

export type PublishPlanErrorCode =
  /** The draft does not pass `validateDraft` (same rule as Save), or the course id / files are not usable. */
  | 'invalid'
  /** A file or the whole publish is over the size guards. */
  | 'too_large'
  /** The live manifest.json is there but is not a manifest. */
  | 'bad_manifest'
  /** Unpublish: the course is not in the live manifest. */
  | 'not_published';

export interface PublishPlan {
  courseId: string;
  /** The version of the course that is live after this commit (when `unchanged`, the one that is live now). For Unpublish: the version that was live. */
  version: number;
  /** True when everything of the course is already live: there is nothing to send. */
  unchanged: boolean;
  /** Repo paths (`public/content/...`) with their bytes; `manifest.json` comes last. */
  upserts: CommitUpsert[];
  /** Repo paths to remove. */
  deletes: string[];
  /** The new `manifest.json` as text (empty when `unchanged`). */
  manifestText: string;
  /** Bytes that will be uploaded (the manifest included). */
  uploadBytes: number;
}

export type PublishPlanResult = { ok: true; plan: PublishPlan } | { ok: false; code: PublishPlanErrorCode; errors: string[] };

export interface PlanPublishInput {
  draft: CourseDraft;
  /** The parsed manifest.json that is live now, or null / undefined when there is none yet. */
  remoteManifest: unknown;
  /** ISO time for `generatedAt` (used only when something changed). */
  now: string;
}

export interface PlanUnpublishInput {
  courseId: string;
  remoteManifest: unknown;
  now: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const failed = (code: PublishPlanErrorCode, errors: string[]): PublishPlanResult => ({ ok: false, code, errors });

function isCourseId(id: unknown): id is string {
  return typeof id === 'string' && id !== '' && !id.includes('/') && isSafeRelativePath(`courses/${id}/course.json`);
}

/** The course entries of the live manifest ([] when there is no manifest), or 'bad' when it is not a manifest. Entries are kept as they are. */
function readRemote(remote: unknown): unknown[] | 'bad' {
  if (remote === null || remote === undefined) return [];
  if (isRecord(remote) && Array.isArray(remote.courses)) return remote.courses as unknown[];
  return 'bad';
}

function entryOf(courses: readonly unknown[], id: string): Record<string, unknown> | undefined {
  for (const c of courses) if (isRecord(c) && c.id === id) return c;
  return undefined;
}

function filesOf(entry: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (entry === undefined || !isRecord(entry.files)) return out;
  for (const [path, hash] of Object.entries(entry.files)) if (typeof hash === 'string') out[path] = hash;
  return out;
}

const manifestText = (courses: readonly unknown[], now: string): string =>
  `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: now, courses }, null, 2)}\n`;

/** The listed files of a course that may be deleted: inside `courses/<id>/` and safe. */
const deletablePaths = (id: string, files: Record<string, string>): string[] =>
  Object.keys(files).filter((p) => p.startsWith(`courses/${id}/`) && isSafeRelativePath(p));

async function publish(input: PlanPublishInput): Promise<PublishPlanResult> {
  const valid = validateDraft(input.draft);
  if (!valid.ok) return failed('invalid', valid.errors);
  const id = input.draft.course.id;
  if (!isCourseId(id)) return failed('invalid', [`bad course id: ${String(id)}`]);
  const remote = readRemote(input.remoteManifest);
  if (remote === 'bad') return failed('bad_manifest', ['The live manifest.json is not a manifest.']);

  // The files of this course, keyed by their path relative to the content root.
  const inputFiles: ManifestInputFile[] = [];
  const isText = new Map<string, boolean>();
  for (const [key, value] of Object.entries(draftToFiles(input.draft))) {
    const path = `courses/${id}/${key}`;
    inputFiles.push({ path, bytes: typeof value === 'string' ? encoder.encode(value) : value });
    isText.set(path, typeof value === 'string');
  }

  const old = entryOf(remote, id);
  const built = await buildManifest({ files: inputFiles, previous: old === undefined ? null : { courses: [old] }, now: input.now });
  if (!built.ok) return failed('invalid', built.errors);
  const entry = built.manifest.courses.find((c) => c.id === id);
  if (entry === undefined) return failed('invalid', ['The course could not be listed.']);

  if (!built.changed) {
    return { ok: true, plan: { courseId: id, version: entry.version, unchanged: true, upserts: [], deletes: [], manifestText: '', uploadBytes: 0 } };
  }

  // What has to go up: every file of the draft whose hash is not the live one.
  const oldFiles = filesOf(old);
  const bytesByPath = new Map(inputFiles.map((f) => [f.path, f.bytes]));
  const upserts: CommitUpsert[] = [];
  const errors: string[] = [];
  let total = 0;
  for (const [path, hash] of Object.entries(entry.files)) {
    if (oldFiles[path] === hash) continue;
    const bytes = bytesByPath.get(path);
    if (bytes === undefined) continue;
    const limit = isText.get(path) === true ? MAX_JSON_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length > limit) errors.push(`${path}: ${bytes.length} bytes is over the limit of ${limit} bytes`);
    total += bytes.length;
    upserts.push({ path: `${CONTENT_PREFIX}${path}`, bytes });
  }
  if (errors.length > 0) return failed('too_large', errors);

  // What has to go: files the live manifest lists for this course that the draft no longer has.
  const deletes = deletablePaths(id, oldFiles)
    .filter((p) => entry.files[p] === undefined)
    .map((p) => `${CONTENT_PREFIX}${p}`);

  // Every other course stays as it is; this course keeps its place, or goes last when it is new.
  const courses: unknown[] = old === undefined ? [...remote, entry] : remote.map((c) => (isRecord(c) && c.id === id ? entry : c));
  const text = manifestText(courses, input.now);
  const manifestBytes = encoder.encode(text);
  total += manifestBytes.length;
  if (total > MAX_COMMIT_BYTES) {
    return failed('too_large', [`One publish may carry at most ${MAX_COMMIT_BYTES} bytes; this one has ${total} bytes.`]);
  }
  upserts.push({ path: `${CONTENT_PREFIX}${MANIFEST_PATH}`, bytes: manifestBytes });

  return { ok: true, plan: { courseId: id, version: entry.version, unchanged: false, upserts, deletes, manifestText: text, uploadBytes: total } };
}

/** The plan for the Publish button of one course. Never throws. */
export async function planPublish(input: PlanPublishInput): Promise<PublishPlanResult> {
  try {
    return await publish(input);
  } catch {
    return failed('invalid', ['The publish plan could not be made.']);
  }
}

/** The plan for Unpublish: delete every file the live manifest lists for the course, and take its entry out of the manifest. Never throws. */
export function planUnpublish(input: PlanUnpublishInput): PublishPlanResult {
  try {
    const id = input.courseId;
    if (!isCourseId(id)) return failed('invalid', [`bad course id: ${String(id)}`]);
    const remote = readRemote(input.remoteManifest);
    if (remote === 'bad') return failed('bad_manifest', ['The live manifest.json is not a manifest.']);
    const entry = entryOf(remote, id);
    if (entry === undefined) return failed('not_published', [`Course ${id} is not in the live manifest.`]);

    const deletes = deletablePaths(id, filesOf(entry)).map((p) => `${CONTENT_PREFIX}${p}`);
    const text = manifestText(
      remote.filter((c) => !(isRecord(c) && c.id === id)),
      input.now,
    );
    const manifestBytes = encoder.encode(text);
    return {
      ok: true,
      plan: {
        courseId: id,
        version: typeof entry.version === 'number' ? entry.version : 0,
        unchanged: false,
        upserts: [{ path: `${CONTENT_PREFIX}${MANIFEST_PATH}`, bytes: manifestBytes }],
        deletes,
        manifestText: text,
        uploadBytes: manifestBytes.length,
      },
    };
  } catch {
    return failed('invalid', ['The unpublish plan could not be made.']);
  }
}
