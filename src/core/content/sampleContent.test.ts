// @vitest-environment node
// Checks the REAL files in public/content/ (the sample courses): valid format, hashes match, images exist, ids unique.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';
import { effectiveQuestionCount } from './scoring';
import type { Block, Test } from './types';
import { validateBlocks, validateCourseCard, validateManifest, validateTest } from './validate';

const root = join(process.cwd(), 'public', 'content');
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));

function listFiles(dir: string): string[] {
  return (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((p) => statSync(join(root, dir, p)).isFile())
    .map((p) => `${dir}/${p.split('\\').join('/')}`)
    .sort();
}

const manifestResult = validateManifest(readJson('manifest.json'));

describe('public/content/manifest.json', () => {
  it('is valid', () => {
    expect(manifestResult.ok, manifestResult.ok ? '' : manifestResult.errors.join('\n')).toBe(true);
  });
});

const courses = manifestResult.ok ? manifestResult.value.courses : [];

describe.each(courses.map((c) => [c.id, c] as const))('course %s', (id, entry) => {
  const dir = `courses/${id}`;

  it('lists exactly the files that exist in its folder, with matching SHA-256', async () => {
    expect(Object.keys(entry.files).sort()).toEqual(listFiles(dir));
    for (const [file, hash] of Object.entries(entry.files)) {
      expect(await sha256Hex(readFileSync(join(root, file))), file).toBe(hash);
    }
  });

  it('has a valid course.json that matches its folder and manifest title', () => {
    const card = validateCourseCard(readJson(`${dir}/course.json`));
    expect(card.ok, card.ok ? '' : card.errors.join('\n')).toBe(true);
    if (!card.ok) return;
    expect(card.value.id).toBe(id);
    expect(card.value.title).toBe(entry.title);
    if (card.value.cover) expect(existsSync(join(root, dir, card.value.cover)), card.value.cover).toBe(true);
  });

  it('has valid optional sections, existing images and unique ids', () => {
    const blocks: Block[] = [];
    for (const name of ['overview', 'content']) {
      const path = `${dir}/${name}.json`;
      if (!existsSync(join(root, path))) continue;
      const result = validateBlocks(readJson(path));
      expect(result.ok, result.ok ? '' : `${path}: ${result.errors.join('\n')}`).toBe(true);
      if (result.ok) blocks.push(...result.value.blocks);
    }
    for (const block of blocks) {
      if (block.type === 'image') expect(existsSync(join(root, dir, block.src ?? '')), block.src).toBe(true);
    }
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size, 'block ids must be unique across overview and content').toBe(ids.length);

    const testPath = `${dir}/test.json`;
    if (existsSync(join(root, testPath))) {
      const result = validateTest(readJson(testPath));
      expect(result.ok, result.ok ? '' : `${testPath}: ${result.errors.join('\n')}`).toBe(true);
      if (result.ok && result.value.image) {
        expect(existsSync(join(root, dir, result.value.image))).toBe(true);
      }
    }
  });
});

describe('the sample courses are what the plan says', () => {
  it('has the general science course with overview, content and a test', () => {
    const dir = 'courses/crs-sci00001';
    const overview = validateBlocks(readJson(`${dir}/overview.json`));
    const content = validateBlocks(readJson(`${dir}/content.json`));
    const test = validateTest(readJson(`${dir}/test.json`));
    expect(overview.ok && content.ok && test.ok).toBe(true);
    if (!overview.ok || !content.ok || !test.ok) return;
    expect(overview.value.blocks.length).toBeGreaterThanOrEqual(5);
    expect(content.value.blocks.length).toBeGreaterThanOrEqual(6);
    expect(content.value.blocks.some((b) => b.type === 'image')).toBe(true);
    const t: Test = test.value;
    expect(t.questions).toHaveLength(6);
    expect(t.questionsPerGame).toBe(5);
    expect(effectiveQuestionCount(t.questionsPerGame, t.questions.length)).toBe(5);
    expect(t.questions.some((q) => q.explanation !== undefined)).toBe(true);
  });

  it('has an empty course that only has course.json (tests the "not available" state)', () => {
    expect(listFiles('courses/crs-empty001')).toEqual(['courses/crs-empty001/course.json']);
  });
});
