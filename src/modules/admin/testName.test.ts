import { describe, expect, it } from 'vitest';
import { t, tf } from '../../core/i18n';
import { questionsText, testName } from './testName';

describe('testName', () => {
  it('uses the title of the test (Gujarati too)', () => {
    expect(testName({ title: 'પ્રકરણ ૧ ની કસોટી' }, 0)).toBe('પ્રકરણ ૧ ની કસોટી');
    expect(testName({ title: 'Quiz' }, 4)).toBe('Quiz');
  });

  it('names a test without a title by its place in the list, starting at 1', () => {
    expect(testName({}, 0)).toBe(tf('admin.tests.untitled', { n: 1 }));
    expect(testName({}, 2)).toBe(tf('admin.tests.untitled', { n: 3 }));
  });

  it('treats an empty or blank title as no title', () => {
    expect(testName({ title: '' }, 1)).toBe(tf('admin.tests.untitled', { n: 2 }));
    expect(testName({ title: '   ' }, 1)).toBe(tf('admin.tests.untitled', { n: 2 }));
  });
});

describe('questionsText', () => {
  it('says none, one or many', () => {
    expect(questionsText(0)).toBe(t('admin.tests.questionsNone'));
    expect(questionsText(1)).toBe(t('admin.tests.questionsOne'));
    expect(questionsText(2)).toBe(tf('admin.tests.questionsMany', { count: 2 }));
    expect(questionsText(12)).toBe(tf('admin.tests.questionsMany', { count: 12 }));
  });
});
