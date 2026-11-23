import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { runLayoutCheck } from '../../core/ui';
import { CourseWorkspace } from './CourseWorkspace';

// P10 T11o O5 (2): layout guard for a chapter that has picture cards, at 360 / 768 / 1366 px (same method as CourseWorkspace.layout.test.tsx).
// jsdom has no layout engine (every box is 0 x 0), so this proves the wiring: the rows of the picture card that could collide on a narrow
// screen (the three position buttons, the width / height boxes) carry `data-np-check`, and `runLayoutCheck` (the function the gallery runs
// in a real browser) reports nothing. Real pixels are judged by the owner in T11q.

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const LONG = 'x'.repeat(90);

const LEFT: Block = { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: LONG, width: 40, height: 150, align: 'left' };
const RIGHT: Block = { id: 'blk-pic00002', type: 'image', src: 'images/2.png', alt: 'A dog', width: 60, align: 'right' };

function draftWith(pictures: Block[], withFiles = true): CourseDraft {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [newTextBlock('title', LONG), newTextBlock('text', LONG), ...pictures, newTextBlock('text', LONG)];
  draft.images = withFiles
    ? pictures.map((block) => ({ path: block.src ?? '', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }))
    : [];
  return draft;
}

function show(draft: CourseDraft) {
  render(<CourseWorkspace draft={draft} busy={false} encodeWebp={noEncoder} onSave={() => undefined} onCancel={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: t('admin.editor.content') }));
}

const originalWidth = window.innerWidth;

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const checked = (selector: string) => document.querySelectorAll(`${selector}[data-np-check]`);

afterEach(() => {
  setWindowWidth(originalWidth);
});

describe.each([360, 768, 1366])('chapter window with picture cards at %i px', (width) => {
  it('one picture card: the position buttons and the size boxes are checked and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith([LEFT]));
    expect(document.querySelectorAll('.np-picture')).toHaveLength(1);
    expect(checked('.np-picture__aligns')).toHaveLength(1);
    expect(checked('.np-picture__sizes')).toHaveLength(1);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('two picture cards in a row (left and right): every card is checked and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith([LEFT, RIGHT]));
    expect(document.querySelectorAll('.np-picture')).toHaveLength(2);
    expect(checked('.np-picture__aligns')).toHaveLength(2);
    expect(checked('.np-picture__sizes')).toHaveLength(2);
    expect(runLayoutCheck()).toEqual([]);
  });

  it('a picture whose file is not in the draft shows the warning and nothing collides', () => {
    setWindowWidth(width);
    show(draftWith([LEFT], false));
    expect(document.querySelector('.np-picture__missing')).not.toBeNull();
    expect(runLayoutCheck()).toEqual([]);
  });
});
