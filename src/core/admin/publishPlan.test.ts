// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CONTENT_PREFIX, MAX_COMMIT_BYTES } from './githubWrite';
import { createCourseDraft, newImageBlock, newTextBlock, type CourseDraft, type DraftImage } from './model';
import { MAX_IMAGE_BYTES, MAX_JSON_BYTES, planPublish, planUnpublish, type PublishPlan, type PublishPlanResult } from './publishPlan';

const T1 = '2026-11-23T10:00:00.000Z';
const T2 = '2026-11-23T11:00:00.000Z';
const T3 = '2026-11-23T12:00:00.000Z';
const decoder = new TextDecoder();

interface LiveEntry {
  id: string;
  title: string;
  version: number;
  files: Record<string, string>;
}
interface LiveManifest {
  schemaVersion: number;
  generatedAt: string;
  courses: LiveEntry[];
}

function good(r: PublishPlanResult): PublishPlan {
  if (!r.ok) throw new Error(`plan failed: ${r.code}: ${r.errors.join('; ')}`);
  return r.plan;
}

const live = (plan: PublishPlan): LiveManifest => JSON.parse(plan.manifestText) as LiveManifest;
const pathsOf = (plan: PublishPlan): string[] => plan.upserts.map((u) => u.path);

const IMAGE: DraftImage = { path: 'images/1.webp', mime: 'image/webp', bytes: new Uint8Array([1, 2, 3, 4]) };

function makeDraft(extra: Partial<CourseDraft> = {}): CourseDraft {
  const draft = createCourseDraft({ title: 'Gujarati basics', order: 1 });
  return {
    ...draft,
    overview: [newTextBlock('text', 'Overview text')],
    content: [newTextBlock('title', 'Chapter 1'), newTextBlock('text', 'Hello')],
    ...extra,
  };
}

const editedText = (draft: CourseDraft, text: string): CourseDraft => ({
  ...draft,
  content: draft.content.map((b) => (b.type === 'text' ? { ...b, text } : b)),
});

const OTHER: LiveEntry & { extra: string } = {
  id: 'crs-other',
  title: 'Other course',
  version: 7,
  files: { 'courses/crs-other/course.json': 'ab'.repeat(32) },
  extra: 'kept as it is',
};

describe('planPublish: a new course', () => {
  it('uploads every file of the course and then manifest.json, deletes nothing, starts at version 1', async () => {
    const draft = makeDraft({ images: [IMAGE] });
    const root = `${CONTENT_PREFIX}courses/${draft.course.id}/`;
    const plan = good(await planPublish({ draft, remoteManifest: null, now: T1 }));

    expect(plan.courseId).toBe(draft.course.id);
    expect(plan.unchanged).toBe(false);
    expect(plan.version).toBe(1);
    expect(plan.deletes).toEqual([]);
    expect(pathsOf(plan)).toEqual([
      `${root}content.json`,
      `${root}course.json`,
      `${root}images/1.webp`,
      `${root}overview.json`,
      `${CONTENT_PREFIX}manifest.json`,
    ]);
    expect(plan.uploadBytes).toBe(plan.upserts.reduce((sum, u) => sum + u.bytes.length, 0));

    const manifest = live(plan);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.generatedAt).toBe(T1);
    expect(manifest.courses.map((c) => [c.id, c.title, c.version])).toEqual([[draft.course.id, 'Gujarati basics', 1]]);
    expect(manifest.courses.flatMap((c) => Object.keys(c.files))).toHaveLength(4);
    expect(plan.manifestText.endsWith('}\n')).toBe(true);
  });

  it('the manifest.json upload is exactly the manifest text', async () => {
    const plan = good(await planPublish({ draft: makeDraft(), remoteManifest: undefined, now: T1 }));
    const last = plan.upserts.map((u) => decoder.decode(u.bytes)).slice(-1);
    expect(last).toEqual([plan.manifestText]);
  });

  it('puts the new course after the courses that are already live and leaves them untouched', async () => {
    const remote = { schemaVersion: 1, generatedAt: T1, courses: [OTHER] };
    const plan = good(await planPublish({ draft: makeDraft(), remoteManifest: remote, now: T2 }));
    const manifest = live(plan);
    expect(manifest.courses.map((c) => c.id)).toEqual(['crs-other', plan.courseId]);
    expect(JSON.stringify(manifest.courses.slice(0, 1))).toBe(JSON.stringify([OTHER]));
    expect(manifest.generatedAt).toBe(T2);
  });
});

describe('planPublish: a course that is live already', () => {
  it('sends nothing when nothing changed', async () => {
    const draft = makeDraft({ images: [IMAGE] });
    const first = good(await planPublish({ draft, remoteManifest: null, now: T1 }));
    const again = good(await planPublish({ draft, remoteManifest: live(first), now: T2 }));
    expect(again.unchanged).toBe(true);
    expect(again.version).toBe(1);
    expect(again.upserts).toEqual([]);
    expect(again.deletes).toEqual([]);
    expect(again.manifestText).toBe('');
    expect(again.uploadBytes).toBe(0);
  });

  it('uploads only the changed file and the manifest, raises the version, renews generatedAt', async () => {
    const draft = makeDraft({ images: [IMAGE] });
    const root = `${CONTENT_PREFIX}courses/${draft.course.id}/`;
    const first = good(await planPublish({ draft, remoteManifest: null, now: T1 }));
    const second = good(await planPublish({ draft: editedText(draft, 'Hello again'), remoteManifest: live(first), now: T2 }));
    expect(second.unchanged).toBe(false);
    expect(second.version).toBe(2);
    expect(pathsOf(second)).toEqual([`${root}content.json`, `${CONTENT_PREFIX}manifest.json`]);
    expect(second.deletes).toEqual([]);
    expect(live(second).generatedAt).toBe(T2);
    expect(live(second).courses.map((c) => c.version)).toEqual([2]);
  });

  it('deletes a file that the draft no longer has (an unused picture) and uploads only the manifest', async () => {
    const draft = makeDraft({ images: [IMAGE] });
    const root = `${CONTENT_PREFIX}courses/${draft.course.id}/`;
    const first = good(await planPublish({ draft, remoteManifest: null, now: T1 }));
    const second = good(await planPublish({ draft: { ...draft, images: [] }, remoteManifest: live(first), now: T2 }));
    expect(second.version).toBe(2);
    expect(second.deletes).toEqual([`${root}images/1.webp`]);
    expect(pathsOf(second)).toEqual([`${CONTENT_PREFIX}manifest.json`]);
    expect(live(second).courses.flatMap((c) => Object.keys(c.files))).toHaveLength(3);
  });

  it('a picture that is used by a block and kept is not uploaded twice', async () => {
    const withBlock = makeDraft({ images: [IMAGE], content: [newTextBlock('title', 'T'), newImageBlock('images/1.webp', 'a picture')] });
    const first = good(await planPublish({ draft: withBlock, remoteManifest: null, now: T1 }));
    const changed: CourseDraft = { ...withBlock, overview: [newTextBlock('text', 'New overview')] };
    const second = good(await planPublish({ draft: changed, remoteManifest: live(first), now: T2 }));
    expect(pathsOf(second).filter((p) => p.endsWith('.webp'))).toEqual([]);
  });

  it('keeps the place of the course and every other course exactly as it was', async () => {
    const draft = makeDraft();
    const other2: LiveEntry = { id: 'crs-third', title: 'Third', version: 2, files: { 'courses/crs-third/course.json': 'cd'.repeat(32) } };
    const first = good(await planPublish({ draft, remoteManifest: { schemaVersion: 1, generatedAt: T1, courses: [OTHER] }, now: T1 }));
    const middle = live(first);
    middle.courses.push(other2);
    const second = good(await planPublish({ draft: editedText(draft, 'Changed'), remoteManifest: middle, now: T2 }));
    const manifest = live(second);
    expect(manifest.courses.map((c) => c.id)).toEqual(['crs-other', draft.course.id, 'crs-third']);
    expect(manifest.courses.map((c) => c.version)).toEqual([7, 2, 2]);
    expect(JSON.stringify(manifest.courses.slice(0, 1))).toBe(JSON.stringify([OTHER]));
    expect(JSON.stringify(manifest.courses.slice(2))).toBe(JSON.stringify([other2]));
  });

  it('never deletes outside the course folder, whatever the live manifest lists', async () => {
    const draft = makeDraft();
    const id = draft.course.id;
    const remote = {
      schemaVersion: 1,
      generatedAt: T1,
      courses: [
        {
          id,
          title: 'Old',
          version: 3,
          files: {
            [`courses/${id}/images/old.webp`]: 'ab'.repeat(32),
            'courses/crs-other/course.json': 'cd'.repeat(32),
            [`courses/${id}/../escape.json`]: 'ef'.repeat(32),
            'manifest.json': '01'.repeat(32),
          },
        },
      ],
    };
    const plan = good(await planPublish({ draft, remoteManifest: remote, now: T2 }));
    expect(plan.version).toBe(4);
    expect(plan.deletes).toEqual([`${CONTENT_PREFIX}courses/${id}/images/old.webp`]);
  });
});

describe('planPublish: guards', () => {
  it('refuses a draft that does not pass the Save check', async () => {
    const draft = makeDraft();
    const r = await planPublish({ draft: { ...draft, course: { ...draft.course, title: '' } }, remoteManifest: null, now: T1 });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.code).toBe('invalid');
    expect(r.ok ? 0 : r.errors.length).toBeGreaterThan(0);
  });

  it('a picture of exactly 500 KB is fine, one byte more is too large (and the message names the file)', async () => {
    const at = (size: number) => makeDraft({ images: [{ ...IMAGE, bytes: new Uint8Array(size) }] });
    expect((await planPublish({ draft: at(MAX_IMAGE_BYTES), remoteManifest: null, now: T1 })).ok).toBe(true);
    const r = await planPublish({ draft: at(MAX_IMAGE_BYTES + 1), remoteManifest: null, now: T1 });
    expect(r.ok ? '' : r.code).toBe('too_large');
    expect(r.ok ? [] : r.errors.map((e) => e.includes('images/1.webp'))).toEqual([true]);
  });

  it('a JSON file over 1 MB is too large', async () => {
    const draft = makeDraft({ content: [newTextBlock('text', 'x'.repeat(MAX_JSON_BYTES))] });
    const r = await planPublish({ draft, remoteManifest: null, now: T1 });
    expect(r.ok ? '' : r.code).toBe('too_large');
  });

  it('one publish over 20 MB is too large', async () => {
    const images: DraftImage[] = Array.from({ length: 41 }, (_, i) => ({
      path: `images/${i + 1}.webp`,
      mime: 'image/webp',
      bytes: new Uint8Array(MAX_IMAGE_BYTES),
    }));
    expect(41 * MAX_IMAGE_BYTES).toBeGreaterThan(MAX_COMMIT_BYTES);
    const r = await planPublish({ draft: makeDraft({ images }), remoteManifest: null, now: T1 });
    expect(r.ok ? '' : r.code).toBe('too_large');
  });

  it('refuses a live manifest that is not a manifest (so no other course is lost), but accepts "none yet"', async () => {
    const draft = makeDraft();
    const results = await Promise.all(
      ['text', 42, {}, { courses: 'x' }, []].map((remoteManifest) => planPublish({ draft, remoteManifest, now: T1 })),
    );
    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(results.map(() => 'bad_manifest'));
    const none = await Promise.all([null, undefined].map((remoteManifest) => planPublish({ draft, remoteManifest, now: T1 })));
    expect(none.map((r) => r.ok)).toEqual([true, true]);
  });

  it('never throws, even for nonsense input', async () => {
    const r = await planPublish({ draft: null as unknown as CourseDraft, remoteManifest: null, now: T1 });
    expect(r.ok).toBe(false);
  });
});

describe('planUnpublish', () => {
  it('deletes every file of the course and takes only its entry out of the manifest', async () => {
    const draft = makeDraft({ images: [IMAGE] });
    const published = good(await planPublish({ draft, remoteManifest: { schemaVersion: 1, generatedAt: T1, courses: [OTHER] }, now: T1 }));
    const plan = good(planUnpublish({ courseId: draft.course.id, remoteManifest: live(published), now: T3 }));

    expect(plan.unchanged).toBe(false);
    expect(plan.version).toBe(1);
    expect([...plan.deletes].sort()).toEqual(pathsOf(published).filter((p) => p.includes(`/courses/${draft.course.id}/`)).sort());
    expect(plan.deletes).toHaveLength(4);
    expect(pathsOf(plan)).toEqual([`${CONTENT_PREFIX}manifest.json`]);

    const manifest = live(plan);
    expect(manifest.generatedAt).toBe(T3);
    expect(manifest.courses.map((c) => c.id)).toEqual(['crs-other']);
    expect(JSON.stringify(manifest.courses)).toBe(JSON.stringify([OTHER]));
    expect(plan.upserts.map((u) => decoder.decode(u.bytes))).toEqual([plan.manifestText]);
  });

  it('the last course can be unpublished (an empty course list is a valid manifest)', async () => {
    const draft = makeDraft();
    const published = good(await planPublish({ draft, remoteManifest: null, now: T1 }));
    const plan = good(planUnpublish({ courseId: draft.course.id, remoteManifest: live(published), now: T2 }));
    expect(live(plan).courses).toEqual([]);
  });

  it('says "not published" when the course is not in the manifest or there is no manifest', () => {
    const remote = { schemaVersion: 1, generatedAt: T1, courses: [OTHER] };
    const results = [remote, null, undefined].map((remoteManifest) => planUnpublish({ courseId: 'crs-missing', remoteManifest, now: T1 }));
    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['not_published', 'not_published', 'not_published']);
  });

  it('refuses a live manifest that is not a manifest, and a bad course id', () => {
    expect(planUnpublish({ courseId: 'crs-a', remoteManifest: 'text', now: T1 }).ok).toBe(false);
    const bad = ['', '../x', 'a/b'].map((courseId) => planUnpublish({ courseId, remoteManifest: { courses: [] }, now: T1 }));
    expect(bad.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['invalid', 'invalid', 'invalid']);
  });

  it('never deletes outside the course folder', () => {
    const remote = {
      schemaVersion: 1,
      generatedAt: T1,
      courses: [
        {
          id: 'crs-a',
          title: 'A',
          version: 2,
          files: {
            'courses/crs-a/course.json': 'ab'.repeat(32),
            'courses/crs-b/course.json': 'cd'.repeat(32),
            'courses/crs-a/../x.json': 'ef'.repeat(32),
            'manifest.json': '01'.repeat(32),
          },
        },
      ],
    };
    const plan = good(planUnpublish({ courseId: 'crs-a', remoteManifest: remote, now: T2 }));
    expect(plan.deletes).toEqual([`${CONTENT_PREFIX}courses/crs-a/course.json`]);
  });

  it('never throws, even for nonsense input', () => {
    expect(planUnpublish({ courseId: 42 as unknown as string, remoteManifest: null, now: T1 }).ok).toBe(false);
  });
});
