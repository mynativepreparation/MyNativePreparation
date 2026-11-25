// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildManifest, type BuildManifestResult, type ManifestInputFile } from './manifestBuild';

const T1 = '2026-11-23T10:00:00.000Z';
const T2 = '2026-11-23T11:00:00.000Z';
const enc = new TextEncoder();

const card = (id: string, title: string, order = 0): ManifestInputFile => ({
  path: `courses/${id}/course.json`,
  bytes: enc.encode(JSON.stringify({ id, title, order })),
});
const file = (path: string, text: string): ManifestInputFile => ({ path, bytes: enc.encode(text) });

function good(r: BuildManifestResult): Extract<BuildManifestResult, { ok: true }> {
  if (!r.ok) throw new Error(`build failed: ${r.errors.join('; ')}`);
  return r;
}

const base = (): ManifestInputFile[] => [
  card('crs-a', 'A', 0),
  file('courses/crs-a/overview.json', '{}'),
  card('crs-b', 'B', 1),
];

describe('buildManifest on the real sample content', () => {
  const root = join(fileURLToPath(new URL('../../../public/content', import.meta.url)));
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const files: ManifestInputFile[] = walk(join(root, 'courses')).map((full) => ({
    path: full.slice(root.length + 1).split('\\').join('/'),
    bytes: new Uint8Array(readFileSync(full)),
  }));
  const committedText = readFileSync(join(root, 'manifest.json'), 'utf8').replace(/\r\n/g, '\n');

  it('gives the SAME text as the committed manifest.json (same generatedAt, same order, same hashes)', async () => {
    const r = good(await buildManifest({ files, previous: JSON.parse(committedText), now: T1 }));
    expect(r.changed).toBe(false);
    expect(r.text).toBe(committedText);
  });

  it('starts every course at version 1 when there is no old manifest', async () => {
    const r = good(await buildManifest({ files, previous: null, now: T1 }));
    expect(r.changed).toBe(true);
    expect(r.manifest.generatedAt).toBe(T1);
    expect(r.manifest.courses.map((c) => c.version)).toEqual(r.manifest.courses.map(() => 1));
    expect(r.manifest.courses.map((c) => c.id)).toEqual((JSON.parse(committedText) as { courses: { id: string }[] }).courses.map((c) => c.id));
  });
});

describe('buildManifest', () => {
  it('a new course starts at 1, sorted by order then id, text = 2-space JSON + final newline', async () => {
    const r = good(await buildManifest({ files: [...base()].reverse(), previous: null, now: T1 }));
    expect(r.changed).toBe(true);
    expect(r.manifest.schemaVersion).toBe(1);
    expect(r.manifest.generatedAt).toBe(T1);
    expect(r.manifest.courses.map((c) => [c.id, c.title, c.version])).toEqual([
      ['crs-a', 'A', 1],
      ['crs-b', 'B', 1],
    ]);
    expect(r.text).toBe(`${JSON.stringify(r.manifest, null, 2)}\n`);
    expect(r.text.startsWith('{\n  "schemaVersion": 1,\n  "generatedAt"')).toBe(true);
  });

  it('unchanged input gives the SAME text and keeps the old generatedAt', async () => {
    const first = good(await buildManifest({ files: base(), previous: null, now: T1 }));
    const again = good(await buildManifest({ files: base(), previous: JSON.parse(first.text), now: T2 }));
    expect(again.changed).toBe(false);
    expect(again.manifest.generatedAt).toBe(T1);
    expect(again.text).toBe(first.text);
  });

  it('a changed file raises only the version of its own course and renews generatedAt', async () => {
    const first = good(await buildManifest({ files: base(), previous: null, now: T1 }));
    const files = base().map((f) => (f.path === 'courses/crs-a/overview.json' ? file(f.path, '{"x":1}') : f));
    const second = good(await buildManifest({ files, previous: first.manifest, now: T2 }));
    expect(second.changed).toBe(true);
    expect(second.manifest.generatedAt).toBe(T2);
    expect(second.manifest.courses.map((c) => [c.id, c.version])).toEqual([
      ['crs-a', 2],
      ['crs-b', 1],
    ]);
  });

  it('a new file, a removed file and a new title each raise the version', async () => {
    const first = good(await buildManifest({ files: base(), previous: null, now: T1 }));
    const added = good(await buildManifest({ files: [...base(), file('courses/crs-a/test.json', '{}')], previous: first.manifest, now: T2 }));
    const removed = good(await buildManifest({ files: base().filter((f) => f.path !== 'courses/crs-a/overview.json'), previous: first.manifest, now: T2 }));
    const retitled = good(await buildManifest({ files: [card('crs-a', 'A new', 0), file('courses/crs-a/overview.json', '{}'), card('crs-b', 'B', 1)], previous: first.manifest, now: T2 }));
    const versionOfA = (r: Extract<BuildManifestResult, { ok: true }>): number[] => r.manifest.courses.filter((c) => c.id === 'crs-a').map((c) => c.version);
    expect([added, removed, retitled].map(versionOfA)).toEqual([[2], [2], [2]]);
  });

  it('a removed course disappears and counts as a change', async () => {
    const first = good(await buildManifest({ files: base(), previous: null, now: T1 }));
    const second = good(await buildManifest({ files: base().filter((f) => !f.path.startsWith('courses/crs-b/')), previous: first.manifest, now: T2 }));
    expect(second.changed).toBe(true);
    expect(second.manifest.generatedAt).toBe(T2);
    expect(second.manifest.courses.map((c) => c.id)).toEqual(['crs-a']);
  });

  it('sorts the files of a course like the Windows script ("img1.webp" before "img/x.webp")', async () => {
    const files = [
      card('crs-a', 'A'),
      file('courses/crs-a/img/x.webp', 'x'),
      file('courses/crs-a/img1.webp', 'y'),
      file('courses/crs-a/blocks.json', 'z'),
    ];
    const r = good(await buildManifest({ files, previous: null, now: T1 }));
    expect(r.manifest.courses.map((c) => Object.keys(c.files))).toEqual([
      ['courses/crs-a/blocks.json', 'courses/crs-a/course.json', 'courses/crs-a/img1.webp', 'courses/crs-a/img/x.webp'],
    ]);
  });

  it('the hash is the SHA-256 of the bytes (hex, lowercase)', async () => {
    const r = good(await buildManifest({ files: [card('crs-a', 'A'), file('courses/crs-a/empty.bin', '')], previous: null, now: T1 }));
    expect(r.manifest.courses.map((c) => c.files['courses/crs-a/empty.bin'])).toEqual([
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ]);
  });

  it('ignores files outside courses/<id>/ (manifest.json, loose files)', async () => {
    const files = [...base(), file('manifest.json', '{}'), file('courses/readme.txt', 'hi'), file('fonts/a.woff2', 'f')];
    const r = good(await buildManifest({ files, previous: null, now: T1 }));
    expect(r.manifest.courses.map((c) => Object.keys(c.files).length)).toEqual([2, 1]);
  });

  it('treats an unusable old manifest like no old manifest', async () => {
    const results = await Promise.all(
      [null, 'text', 42, { courses: 'x' }, { courses: [{ id: 'crs-a' }] }].map((previous) => buildManifest({ files: base(), previous, now: T1 })),
    );
    expect(results.map((r) => (r.ok ? r.manifest.courses.map((c) => c.version) : []))).toEqual(results.map(() => [1, 1]));
    expect(results.map((r) => (r.ok ? r.manifest.generatedAt : ''))).toEqual(results.map(() => T1));
  });

  it('reports a bad course folder instead of throwing', async () => {
    const cases: { files: ManifestInputFile[]; error: string }[] = [
      { files: [file('courses/crs-a/overview.json', '{}')], error: 'missing course.json in courses/crs-a' },
      { files: [file('courses/crs-a/course.json', '{oops')], error: 'course.json is not valid JSON in courses/crs-a' },
      { files: [file('courses/crs-a/course.json', '{"id":"crs-a"}')], error: 'course.json needs "id" and "title": courses/crs-a/course.json' },
      { files: [file('courses/crs-other/course.json', JSON.stringify({ id: 'crs-z', title: 'Z' }))], error: 'folder name "crs-other" must equal the course id "crs-z"' },
      { files: [card('crs-a', 'A'), file('courses/crs-a/../x.json', '{}')], error: 'unsafe path: courses/crs-a/../x.json' },
      { files: [card('crs-a', 'A'), card('crs-a', 'A')], error: 'path given twice: courses/crs-a/course.json' },
    ];
    const results = await Promise.all(cases.map((c) => buildManifest({ files: c.files, previous: null, now: T1 })));
    expect(results.map((r) => (r.ok ? [] : r.errors.filter((e) => e !== ''))).map((errs, i) => errs.includes(cases[i]?.error ?? ''))).toEqual(cases.map(() => true));
  });
});
