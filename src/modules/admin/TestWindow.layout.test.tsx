import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Question, Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { TestWindow } from './TestWindow';

// P10 T11t(b): layout guard for the test window at 360 / 768 / 1366 px (same idea as TestManager.layout.test.tsx).
// jsdom has no layout engine, so this proves the wiring: the rows that could collide on a narrow screen carry `data-np-check`, and
// `runLayoutCheck` (the function the gallery runs in a real browser) reports nothing. Real pixels are judged by the owner (T11q).

const LONG = 'આ એક ખૂબ લાંબો પ્રશ્ન છે જે સાંકડી સ્ક્રીન પર પણ લપેટાવો જોઈએ ' + 'x'.repeat(80);

function longQuestion(id: string): Question {
  return { id, text: LONG, options: [LONG, `${LONG} b`, `${LONG} c`, `${LONG} d`], correctIndex: 1, explanation: LONG };
}

const test: Test = { id: 'tst-aaaaaaaa', title: LONG, questionsPerGame: 2, questions: [longQuestion('qst-aaaaaaa1'), longQuestion('qst-aaaaaaa2')] };
const draft = (): CourseDraft => ({ ...createCourseDraft({ title: LONG }), tests: [test] });

function show() {
  render(<TestWindow draft={draft()} testId={test.id} onSave={() => undefined} onBack={() => undefined} />);
}

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('TestWindow at %i px', (width) => {
  it('marks the bottom bar for the layout check, and the check finds nothing', () => {
    setWindowWidth(width);
    show();
    expect(document.querySelectorAll('.np-test-window__bar[data-np-check]')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('still reports nothing with the question list open (one marked tool row per question)', () => {
    setWindowWidth(width);
    show();
    fireEvent.click(screen.getByRole('button', { name: t('admin.testWindow.edit') }));
    expect(document.querySelectorAll('.np-test-window__tools[data-np-check]')).toHaveLength(2);
    expect(document.querySelectorAll('.np-test-window__bar[data-np-check]')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });
});
