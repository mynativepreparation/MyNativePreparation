import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { CourseWorkspace } from './CourseWorkspace';
import { writeSelection } from './richBoxDom';

// A chapter with a picture INSIDE the text, edited through the course workspace (P10 T11o O2): the text boxes and the picture card change
// the flat blocks, and Save sends them up in the same order.

const noEncoder: WebpEncoder = () => Promise.resolve(null);

const PICTURE: Block = { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: 'A cat', width: 40 };

/** Content with one chapter: title, text "Before", the picture, text "After". */
function withPicture(): CourseDraft {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [newTextBlock('title', 'Algebra'), newTextBlock('text', 'Before'), PICTURE, newTextBlock('text', 'After')];
  draft.images = [{ path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }];
  return draft;
}

function setup(draft: CourseDraft) {
  const saved: CourseDraft[] = [];
  render(<CourseWorkspace draft={draft} busy={false} encodeWebp={noEncoder} onSave={(d) => saved.push(d)} onCancel={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: t('admin.editor.content') }));
  return { saved };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const save = () => click(t('admin.course.save'));
const firstBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });
const secondBox = () => screen.getByRole('textbox', { name: tf('admin.chapterWindow.slotLabel', { number: 1 }) });

function typeAtStart(root: HTMLElement, text: string) {
  root.focus();
  writeSelection(root, { anchor: { line: 0, offset: 0 }, focus: { line: 0, offset: 0 } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

const typesOf = (draft: CourseDraft) => draft.content.map((block) => block.type);
const textsOf = (draft: CourseDraft) => draft.content.filter((block) => block.type === 'text').map((block) => block.text);
const pictureOf = (draft: CourseDraft) => draft.content.find((block) => block.type === 'image');

describe('CourseWorkspace with a picture inside the text', () => {
  it('shows the text before the picture, the picture card and the text after it', () => {
    setup(withPicture());
    expect(firstBox().textContent).toBe('Before');
    expect(secondBox().textContent).toBe('After');
    expect(screen.getByRole('region', { name: t('admin.picture.cardLabel') })).toBeInTheDocument();
    expect(screen.getByLabelText(t('admin.picture.altLabel'))).toHaveValue('A cat');
  });

  it('saving without any edit keeps the blocks as they were', () => {
    const { saved } = setup(withPicture());
    save();
    expect(saved).toHaveLength(1);
    expect(typesOf(saved[0] as CourseDraft)).toEqual(['title', 'text', 'image', 'text']);
    expect(textsOf(saved[0] as CourseDraft)).toEqual(['Before', 'After']);
    expect(pictureOf(saved[0] as CourseDraft)).toEqual(PICTURE);
  });

  it('typing in the text after the picture changes only that block', () => {
    const { saved } = setup(withPicture());
    typeAtStart(secondBox(), 'X');
    save();
    expect(typesOf(saved[0] as CourseDraft)).toEqual(['title', 'text', 'image', 'text']);
    expect(textsOf(saved[0] as CourseDraft)).toEqual(['Before', 'XAfter']);
  });

  it('typing in the text before the picture changes only that block', () => {
    const { saved } = setup(withPicture());
    typeAtStart(firstBox(), 'Y');
    save();
    expect(textsOf(saved[0] as CourseDraft)).toEqual(['YBefore', 'After']);
  });

  it('the position buttons set and clear the position of the picture', () => {
    const { saved } = setup(withPicture());
    click(t('admin.picture.alignLeft'));
    save();
    expect(pictureOf(saved[0] as CourseDraft)?.align).toBe('left');
    click(t('admin.picture.alignCenter'));
    save();
    expect(pictureOf(saved[1] as CourseDraft)?.align).toBeUndefined();
  });

  it('Wider and Shorter change the numbers of the picture and keep its other fields', () => {
    const { saved } = setup(withPicture());
    click(t('admin.picture.wider'));
    click(t('admin.picture.shorter'));
    save();
    expect(pictureOf(saved[0] as CourseDraft)).toEqual({ ...PICTURE, width: 50, height: 90 });
  });

  it('a typed description is saved', () => {
    const { saved } = setup(withPicture());
    fireEvent.change(screen.getByLabelText(t('admin.picture.altLabel')), { target: { value: 'A dog' } });
    save();
    expect(pictureOf(saved[0] as CourseDraft)?.alt).toBe('A dog');
  });

  it('Remove takes the picture out, merges the two text boxes and drops the unused file on Save', () => {
    const { saved } = setup(withPicture());
    click(t('admin.picture.remove'));
    expect(screen.queryByRole('region', { name: t('admin.picture.cardLabel') })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: tf('admin.chapterWindow.slotLabel', { number: 1 }) })).not.toBeInTheDocument();
    save();
    expect(typesOf(saved[0] as CourseDraft)).toEqual(['title', 'text', 'text']);
    expect(textsOf(saved[0] as CourseDraft)).toEqual(['Before', 'After']);
    expect(saved[0]?.images).toEqual([]);
  });
});
