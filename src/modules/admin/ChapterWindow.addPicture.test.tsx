import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '../../core/admin/chapterSlots';
import type { Block } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { ChapterWindow, type ChapterWindowProps, type PictureSpot } from './ChapterWindow';
import { writeSelection } from './richBoxDom';

// The Add (picture) button of the toolbar tells the parent WHERE the picture goes (P10 T11o O3): the box that has the focus, cut at its
// caret; from the title or the subtitle the top of the content. Choosing the file is the parent's job (CourseWorkspace.addPicture.test.tsx).
// jsdom has no keyboard, so the caret is made by a hand-made `beforeinput` event (the same way ChapterWindow.test.tsx does it); the caret
// then sits behind the typed text.

const PICTURE: Block = { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '' };

function setup(items: ContentItem[]) {
  const onAddPicture = vi.fn<(spot: PictureSpot) => void>();
  const props: ChapterWindowProps = {
    chapterKey: 'a',
    title: '',
    subtitle: '',
    items,
    onTitleChange: () => undefined,
    onSubtitleChange: () => undefined,
    onSlotChange: () => undefined,
    onPictureChange: () => undefined,
    onPictureRemove: () => undefined,
    onAddPicture,
  };
  render(<ChapterWindow {...props} />);
  return onAddPicture;
}

const titleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.titleLabel') });
const subtitleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.subtitleLabel') });
const firstBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });
const secondBox = () => screen.getByRole('textbox', { name: tf('admin.chapterWindow.slotLabel', { number: 1 }) });
const addButton = () => screen.getByRole('button', { name: t('admin.toolbar.add') });

function typeAt(root: HTMLElement, offset: number, text: string) {
  act(() => {
    root.focus();
  });
  writeSelection(root, { anchor: { line: 0, offset }, focus: { line: 0, offset } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

describe('ChapterWindow: the Add picture button', () => {
  it('reports nothing until the button is pressed', () => {
    const onAddPicture = setup([{ kind: 'slot', key: 'start', text: 'Hello' }]);
    typeAt(firstBox(), 0, 'X');
    expect(onAddPicture).not.toHaveBeenCalled();
  });

  it('from the content: the slot of that box, its text cut at the caret', () => {
    const onAddPicture = setup([{ kind: 'slot', key: 'start', text: 'Helloworld' }]);
    typeAt(firstBox(), 5, 'X');
    fireEvent.click(addButton());
    expect(onAddPicture).toHaveBeenCalledTimes(1);
    expect(onAddPicture).toHaveBeenCalledWith({ key: 'start', before: 'HelloX', after: 'world' });
  });

  it('from the text after a picture: the slot named by that picture', () => {
    const onAddPicture = setup([
      { kind: 'slot', key: 'start', text: 'Before' },
      { kind: 'picture', block: PICTURE },
      { kind: 'slot', key: PICTURE.id, text: 'Afterwards' },
    ]);
    typeAt(secondBox(), 5, 'X');
    fireEvent.click(addButton());
    expect(onAddPicture).toHaveBeenCalledWith({ key: PICTURE.id, before: 'AfterX', after: 'wards' });
  });

  it('from the title: the top of the content, with all of the first text behind the picture', () => {
    const onAddPicture = setup([
      { kind: 'slot', key: 'start', text: 'Body' },
      { kind: 'picture', block: PICTURE },
      { kind: 'slot', key: PICTURE.id, text: 'More' },
    ]);
    act(() => {
      titleBox().focus();
    });
    fireEvent.click(addButton());
    expect(onAddPicture).toHaveBeenCalledWith({ key: 'start', before: '', after: 'Body' });
  });

  it('from the subtitle: the top of the content too', () => {
    const onAddPicture = setup([{ kind: 'slot', key: 'start', text: 'Body' }]);
    act(() => {
      subtitleBox().focus();
    });
    fireEvent.click(addButton());
    expect(onAddPicture).toHaveBeenCalledWith({ key: 'start', before: '', after: 'Body' });
  });
});
