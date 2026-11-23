import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { CourseWorkspace } from './CourseWorkspace';

// P10 T11n C3b: layout guard for the course workspace at 360 / 768 / 1366 px.
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: the rows that could collide on a narrow screen carry
// `data-np-check`, and `runLayoutCheck` (the function the gallery runs in a real browser) reports nothing in every state.
// Real pixels are judged by the owner in T11q. Light / dark and "tokens only" are enforced for every stylesheet by core/ui/styles.test.ts.

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const LONG = 'x'.repeat(90);

function draftWith(title: string): CourseDraft {
  const draft = createCourseDraft({ title });
  draft.content = [
    newTextBlock('title', LONG),
    newTextBlock('subtitle', 'A long subtitle that keeps going and going to test wrapping on a narrow screen'),
    newTextBlock('text', 'Body text'),
    newTextBlock('title', 'Second chapter'),
    newTextBlock('text', 'More text'),
  ];
  return draft;
}

function show(draft: CourseDraft) {
  render(<CourseWorkspace draft={draft} busy={false} encodeWebp={noEncoder} onSave={() => undefined} onCancel={() => undefined} />);
}

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const checked = (selector: string) => document.querySelectorAll(`${selector}[data-np-check]`);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('course workspace layout at %i px', (width) => {
  it('window: the part switch and the bottom bar are checked and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith('Maths'));
    expect(checked('.np-workspace__parts')).toHaveLength(1);
    expect(checked('.np-wbar__main')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('Content part with long texts: nothing collides', () => {
    setWindowWidth(width);
    show(draftWith('Maths'));
    click(t('admin.editor.content'));
    expect(runLayoutCheck()).toEqual([]);
  });

  it('Settings panel open: the course boxes are there and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith(LONG));
    click(t('admin.toolbar.settings'));
    expect(screen.getByLabelText(t('admin.course.fieldTitle'))).toHaveValue(LONG);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('chapter list (Edit): the list and one checked button row per chapter, nothing collides', () => {
    setWindowWidth(width);
    show(draftWith('Maths'));
    click(t('admin.editor.content'));
    click(t('admin.window.edit'));
    expect(checked('.np-chapter-list__items')).toHaveLength(1);
    expect(checked('.np-chapter-list__actions')).toHaveLength(2);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('Test part: the bottom bar is still checked and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith('Maths'));
    click(t('admin.window.partTest'));
    expect(checked('.np-wbar__main')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('the friendly list of problems after a failed Save: nothing collides', () => {
    setWindowWidth(width);
    show(draftWith(''));
    click(t('admin.course.save'));
    expect(screen.getByText(t('admin.problem.title'))).toBeInTheDocument();
    expect(runLayoutCheck()).toEqual([]);
  });
});

describe('course workspace keyboard order', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

  it('no tabindex above 0, so the window keeps its natural reading order', () => {
    show(draftWith('Maths'));
    const positive = [...document.querySelectorAll(FOCUSABLE)].filter((el) => Number(el.getAttribute('tabindex') ?? '0') > 0);
    expect(positive).toEqual([]);
  });
});
