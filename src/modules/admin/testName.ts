import type { Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';

// Texts for one test in the Admin test list (P10 T11s, DECISIONS Q27): its name and its question count.

/** The test's own title, or "Test <n>" (n = its place in the list, starting at 1) when it has none. */
export function testName(test: Pick<Test, 'title'>, index: number): string {
  const title = test.title?.trim() ?? '';
  return title === '' ? tf('admin.tests.untitled', { n: index + 1 }) : title;
}

export function questionsText(count: number): string {
  if (count === 0) return t('admin.tests.questionsNone');
  return count === 1 ? t('admin.tests.questionsOne') : tf('admin.tests.questionsMany', { count });
}
