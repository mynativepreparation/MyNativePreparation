import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, createTest, newTextBlock, type CourseDraft } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { CourseWorkspace } from './CourseWorkspace';
import { writeSelection } from './richBoxDom';

// The course workspace (P10 T11n C3a): part switch, ONE chapter window, the chapter list (Edit), the Settings panel of the toolbar and
// the bottom bar. The boxes themselves are tested in ChapterWindow.test.tsx; jsdom has no keyboard, so typing is a hand-made
// `beforeinput` event (the same way ChapterWindow.test.tsx does it).

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const OVERVIEW = t('admin.editor.overview');
const CONTENT = t('admin.editor.content');
const TEST = t('admin.window.partTest');

/** Content with two chapters: Algebra (title, subtitle, text) and Geometry (title, text). */
function twoChapters(): CourseDraft {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [
    newTextBlock('title', 'Algebra'),
    newTextBlock('subtitle', 'Basics'),
    newTextBlock('text', 'x plus y'),
    newTextBlock('title', 'Geometry'),
    newTextBlock('text', 'a triangle'),
  ];
  return draft;
}

function setup(draft: CourseDraft, busy = false) {
  const saved: CourseDraft[] = [];
  let cancelled = 0;
  render(
    <CourseWorkspace
      draft={draft}
      busy={busy}
      encodeWebp={noEncoder}
      onSave={(d) => saved.push(d)}
      onCancel={() => {
        cancelled += 1;
      }}
    />,
  );
  return { saved, cancelled: () => cancelled };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const save = () => click(t('admin.course.save'));
const titleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.titleLabel') });
const subtitleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.subtitleLabel') });
const contentBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });

function typeAtStart(root: HTMLElement, text: string) {
  root.focus();
  writeSelection(root, { anchor: { line: 0, offset: 0 }, focus: { line: 0, offset: 0 } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

const titlesOf = (draft: CourseDraft) => draft.content.filter((block) => block.type === 'title').map((block) => block.text);

describe('CourseWorkspace: what it shows', () => {
  it('opens on the Overview with the part switch, the toolbar, the three boxes and the bottom bar', () => {
    setup(twoChapters());
    expect(screen.getByRole('button', { name: OVERVIEW })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: CONTENT })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: TEST })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: t('admin.toolbar.style') })).toBeInTheDocument();
    expect(titleBox()).toBeInTheDocument();
    expect(subtitleBox()).toBeInTheDocument();
    expect(contentBox()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.course.save') })).toBeEnabled();
    expect(screen.getByRole('button', { name: t('admin.window.edit') })).toBeEnabled();
    expect(screen.getByRole('button', { name: t('admin.window.add') })).toBeEnabled();
    expect(screen.getByRole('button', { name: t('admin.window.publish') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('admin.course.cancel') })).toBeEnabled();
  });

  it('the Content part shows the first chapter in the three boxes', () => {
    setup(twoChapters());
    click(CONTENT);
    expect(titleBox().textContent).toBe('Algebra');
    expect(subtitleBox().textContent).toBe('Basics');
    expect(contentBox().textContent).toBe('x plus y');
  });

  it('the Test part has the test editor and neither the toolbar, Edit nor Add chapter', () => {
    setup(twoChapters());
    click(TEST);
    expect(screen.queryByRole('button', { name: t('admin.toolbar.style') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('admin.window.edit') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('admin.window.add') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.course.save') })).toBeEnabled();
  });

  it('turns everything off while a save is running (Publish is always off for now)', () => {
    setup(twoChapters(), true);
    expect(screen.getByRole('button', { name: t('admin.course.save') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('admin.course.cancel') })).toBeDisabled();
    expect(screen.getByRole('button', { name: CONTENT })).toBeDisabled();
    expect(titleBox()).toHaveAttribute('aria-disabled', 'true');
  });

  it('Cancel is reported to the parent', () => {
    const { cancelled } = setup(twoChapters());
    click(t('admin.course.cancel'));
    expect(cancelled()).toBe(1);
  });
});

describe('CourseWorkspace: Save', () => {
  it('saves an untouched draft with the very same blocks and ids', () => {
    const draft = twoChapters();
    const original = [...draft.content];
    const { saved } = setup(draft);
    save();
    expect(saved.map((d) => d.content)).toEqual([original]);
    expect(saved.map((d) => d.course.title)).toEqual(['Maths']);
  });

  it('typing in a title box changes only that title block and keeps every id', () => {
    const draft = twoChapters();
    const ids = draft.content.map((block) => block.id);
    const { saved } = setup(draft);
    click(CONTENT);
    typeAtStart(titleBox(), 'Intro ');
    save();
    expect(saved.map(titlesOf)).toEqual([['Intro Algebra', 'Geometry']]);
    expect(saved.map((d) => d.content.map((block) => block.id))).toEqual([ids]);
  });

  it('an empty test is saved as nothing', () => {
    const draft = twoChapters();
    draft.tests = [createTest()];
    const { saved } = setup(draft);
    save();
    expect(saved.map((d) => d.tests)).toEqual([[]]);
  });
});

describe('CourseWorkspace: chapters', () => {
  it('Add chapter opens an empty chapter after the open one; a title typed there is saved in that place', () => {
    const { saved } = setup(twoChapters());
    click(CONTENT);
    click(t('admin.window.add'));
    expect(titleBox().textContent).toBe('');
    typeAtStart(titleBox(), 'Equations');
    save();
    expect(saved.map(titlesOf)).toEqual([['Algebra', 'Equations', 'Geometry']]);
  });

  it('an added chapter that stays empty is left out on Save', () => {
    const draft = twoChapters();
    const original = [...draft.content];
    const { saved } = setup(draft);
    click(CONTENT);
    click(t('admin.window.add'));
    save();
    expect(saved.map((d) => d.content)).toEqual([original]);
  });

  it('Edit opens the chapter list and Open shows the other chapter in the boxes', () => {
    setup(twoChapters());
    click(CONTENT);
    expect(screen.getByRole('button', { name: t('admin.window.edit') })).toHaveAttribute('aria-expanded', 'false');
    click(t('admin.window.edit'));
    const list = screen.getByRole('region', { name: tf('admin.window.listHeading', { name: CONTENT }) });
    const second = tf('admin.chapter.heading', { name: CONTENT, n: 2 });
    fireEvent.click(within(list).getByRole('button', { name: tf('admin.window.openNamed', { chapter: second }) }));
    expect(titleBox().textContent).toBe('Geometry');
    expect(contentBox().textContent).toBe('a triangle');
    expect(screen.queryByRole('region', { name: tf('admin.window.listHeading', { name: CONTENT }) })).not.toBeInTheDocument();
  });
});

describe('CourseWorkspace: course details in the Settings panel', () => {
  it('shows the saved title and saves a changed one with the same id', () => {
    const draft = twoChapters();
    const { saved } = setup(draft);
    click(t('admin.toolbar.settings'));
    expect(screen.getByLabelText(t('admin.course.fieldTitle'))).toHaveValue('Maths');
    fireEvent.change(screen.getByLabelText(t('admin.course.fieldTitle')), { target: { value: 'Algebra 101' } });
    save();
    expect(saved.map((d) => d.course.title)).toEqual(['Algebra 101']);
    expect(saved.map((d) => d.course.id)).toEqual([draft.course.id]);
  });

  it('a wrong order is not saved and the friendly list says so', () => {
    const { saved } = setup(twoChapters());
    click(t('admin.toolbar.settings'));
    fireEvent.change(screen.getByLabelText(t('admin.course.fieldOrder')), { target: { value: 'abc' } });
    save();
    expect(saved).toEqual([]);
    expect(screen.getByText(tf('admin.problem.courseOrder', { where: '', n: 0 }))).toBeInTheDocument();
  });
});
