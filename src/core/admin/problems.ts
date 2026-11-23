import type { TextKey } from '../i18n';
import { validateDraft, type CourseDraft } from './model';

// Friendly "fix this before saving" list (P10 T9(a), SPEC D5). It runs `validateDraft` and turns its technical messages into
// short problems the developer can act on. Raw messages are never shown. Anything it does not recognise becomes ONE generic
// problem, so a bad draft can never be saved silently. Pure function: no DOM, no storage.

export interface Problem {
  /** en.json key; placeholders are `{where}` and `{n}`. */
  key: TextKey;
  /** Which block list the problem is in (for `{where}`). */
  part?: 'overview' | 'content';
  /** Human number (starts at 1) of the block or question (for `{n}`). */
  n?: number;
}

const BLOCK_TEXT = /^(overview|content): blocks\[(\d+)\]\.text\b/;
const BLOCK_IMAGE = /^(overview|content): blocks\[(\d+)\]\.src\b/;
const BLOCK_IMAGE_MISSING = /^(overview|content)\.blocks\[(\d+)\]: image /;
const QUESTION_TEXT = /^tests\[\d+\]: questions\[(\d+)\]\.text\b/;
const QUESTION_OPTIONS = /^tests\[\d+\]: questions\[(\d+)\]\.options\b/;
const QUESTION_CORRECT = /^tests\[\d+\]: questions\[(\d+)\]\.correctIndex\b/;
const TEST_PER_GAME = /^tests\[\d+\]: questionsPerGame/;
const TEST_IMAGE = /^tests\[\d+\]\.image:/;

function classify(raw: string): Problem {
  let m = BLOCK_TEXT.exec(raw);
  if (m) return { key: 'admin.problem.blockText', part: m[1] as 'overview' | 'content', n: Number(m[2]) + 1 };
  m = BLOCK_IMAGE.exec(raw);
  if (m) return { key: 'admin.problem.blockImage', part: m[1] as 'overview' | 'content', n: Number(m[2]) + 1 };
  m = BLOCK_IMAGE_MISSING.exec(raw);
  if (m) return { key: 'admin.problem.blockImage', part: m[1] as 'overview' | 'content', n: Number(m[2]) + 1 };
  m = QUESTION_TEXT.exec(raw);
  if (m) return { key: 'admin.problem.questionText', n: Number(m[1]) + 1 };
  m = QUESTION_OPTIONS.exec(raw);
  if (m) return { key: 'admin.problem.questionOptions', n: Number(m[1]) + 1 };
  m = QUESTION_CORRECT.exec(raw);
  if (m) return { key: 'admin.problem.questionCorrect', n: Number(m[1]) + 1 };
  if (TEST_PER_GAME.test(raw)) return { key: 'admin.problem.perGame' };
  if (raw.startsWith('course: title')) return { key: 'admin.problem.courseTitle' };
  if (raw.startsWith('course: order')) return { key: 'admin.problem.courseOrder' };
  if (raw.startsWith('course.cover:') || TEST_IMAGE.test(raw) || /^images: /.test(raw)) {
    return { key: 'admin.problem.image' };
  }
  return { key: 'admin.problem.other' };
}

/** Empty list = the draft can be saved. Same problem twice (e.g. two bad answer boxes of one question) is listed once. */
export function summarizeProblems(draft: CourseDraft): Problem[] {
  const result = validateDraft(draft);
  if (result.ok) return [];
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const raw of result.errors) {
    const problem = classify(raw);
    const id = `${problem.key}|${problem.part ?? ''}|${problem.n ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(problem);
  }
  return out;
}
