import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { TestManager } from './TestManager';

// P10 T11s: layout guard for the test list at 360 / 768 / 1366 px (same idea as CourseWorkspace.layout.test.tsx).
// jsdom has no layout engine, so this proves the wiring: the rows that could collide on a narrow screen carry `data-np-check`, and
// `runLayoutCheck` (the function the gallery runs in a real browser) reports nothing. Real pixels are judged by the owner (T11q).

const LONG = 'આ એક ખૂબ લાંબું નામ ધરાવતી કસોટી છે જે સાંકડી સ્ક્રીન પર પણ લપેટાવી જોઈએ ' + 'x'.repeat(60);

const tests: Test[] = [
  { id: 'tst-aaaaaaaa', title: LONG, questionsPerGame: 1, questions: [] },
  { id: 'tst-bbbbbbbb', questionsPerGame: 1, questions: [] },
];

const draft = (): CourseDraft => ({ ...createCourseDraft({ title: LONG }), tests });

function show() {
  render(<TestManager draft={draft()} onBack={() => undefined} onOpenTest={() => undefined} onDeleteTest={() => undefined} />);
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

describe.each([360, 768, 1366])('TestManager at %i px', (width) => {
  it('marks the list and the button rows for the layout check, and the check finds nothing', () => {
    setWindowWidth(width);
    show();
    expect(document.querySelectorAll('.np-courses__list[data-np-check]')).toHaveLength(1);
    expect(document.querySelectorAll('.np-courses__actions[data-np-check]')).toHaveLength(2);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('still reports nothing while a delete question is open', () => {
    setWindowWidth(width);
    show();
    fireEvent.click(screen.getByRole('button', { name: tf('admin.tests.deleteNamed', { name: LONG }) }));
    expect(screen.getByRole('button', { name: t('admin.tests.confirmNo') })).toBeInTheDocument();
    expect(document.querySelectorAll('.np-courses__actions[data-np-check]')).toHaveLength(2);
    expect(runLayoutCheck()).toEqual([]);
  });
});
