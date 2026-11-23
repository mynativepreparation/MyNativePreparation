import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { START_SLOT, type ContentItem, type PicturePatch } from '../../core/admin/chapterSlots';
import type { DraftImage } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { ChapterWindow, type ChapterWindowProps } from './ChapterWindow';
import { writeSelection } from './richBoxDom';

// The chapter window with a picture inside the text (P10 T11o O2): text box, picture card, text box. The window only shows the items it is
// given and reports edits; core/admin/chapterSlots.ts does the changing.

const PICTURE: Block = { id: 'blk-pic1', type: 'image', src: 'images/1.png', alt: 'A cat', width: 40 };
const IMAGE: DraftImage = { path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) };

const WITH_PICTURE: ContentItem[] = [
  { kind: 'slot', key: START_SLOT, text: 'Before' },
  { kind: 'picture', block: PICTURE },
  { kind: 'slot', key: PICTURE.id, text: 'After' },
];
const MERGED: ContentItem[] = [{ kind: 'slot', key: START_SLOT, text: 'BeforeAfter' }];

function setup(props: Partial<ChapterWindowProps> = {}) {
  const handlers = {
    onTitleChange: vi.fn<(text: string) => void>(),
    onSubtitleChange: vi.fn<(text: string) => void>(),
    onSlotChange: vi.fn<(key: string, text: string) => void>(),
    onPictureChange: vi.fn<(id: string, patch: PicturePatch) => void>(),
    onPictureRemove: vi.fn<(id: string) => void>(),
  };
  const full: ChapterWindowProps = {
    chapterKey: 'a',
    title: '',
    subtitle: '',
    items: WITH_PICTURE,
    images: [IMAGE],
    ...handlers,
    ...props,
  };
  const view = render(<ChapterWindow {...full} />);
  return { ...handlers, view, full };
}

const firstBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });
const secondBox = () => screen.getByRole('textbox', { name: tf('admin.chapterWindow.slotLabel', { number: 1 }) });
const card = () => screen.getByRole('region', { name: t('admin.picture.cardLabel') });
const styleButtons = () => screen.getAllByRole('button', { name: t('admin.toolbar.style') });

function typeInto(root: HTMLElement, text: string) {
  root.focus();
  writeSelection(root, { anchor: { line: 0, offset: 0 }, focus: { line: 0, offset: 0 } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

describe('ChapterWindow with a picture', () => {
  it('shows a text box, the picture card and a second text box, in this order, and reports nothing', () => {
    const { onSlotChange, onPictureChange } = setup();
    expect(firstBox().textContent).toBe('Before');
    expect(secondBox().textContent).toBe('After');
    expect(card()).toBeInTheDocument();
    const order = [firstBox(), card(), secondBox()];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as HTMLElement;
      const after = order[i] as HTMLElement;
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(onSlotChange).not.toHaveBeenCalled();
    expect(onPictureChange).not.toHaveBeenCalled();
  });

  it('the second text box has its own label and placeholder', () => {
    setup();
    expect(secondBox()).toHaveAttribute('data-placeholder', t('admin.chapterWindow.slotPlaceholder'));
  });

  it('the picture card shows the thumbnail and the numbers of the picture', () => {
    setup();
    expect(card().querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByLabelText(t('admin.picture.widthLabel'))).toHaveValue('40');
    expect(screen.getByLabelText(t('admin.picture.altLabel'))).toHaveValue('A cat');
  });

  it('a picture whose file is not among the images says so', () => {
    setup({ images: [] });
    expect(screen.getByText(t('admin.picture.missing'))).toBeInTheDocument();
  });

  it('typing in each text box reports the text of THAT slot', () => {
    const { onSlotChange } = setup();
    typeInto(secondBox(), 'x');
    typeInto(firstBox(), 'y');
    expect(onSlotChange.mock.calls.map(([key, text]) => [key, text])).toEqual([
      [PICTURE.id, 'xAfter'],
      [START_SLOT, 'yBefore'],
    ]);
  });

  it('the card reports its changes and its removal with the id of the picture', () => {
    const { onPictureChange, onPictureRemove } = setup();
    fireEvent.click(screen.getByRole('button', { name: t('admin.picture.alignLeft') }));
    fireEvent.click(screen.getByRole('button', { name: t('admin.picture.wider') }));
    fireEvent.click(screen.getByRole('button', { name: t('admin.picture.remove') }));
    expect(onPictureChange.mock.calls.map(([id, patch]) => [id, patch])).toEqual([
      [PICTURE.id, { align: 'left' }],
      [PICTURE.id, { width: 50 }],
    ]);
    expect(onPictureRemove.mock.calls).toEqual([[PICTURE.id]]);
  });

  it('there is still only ONE toolbar, also when the focus is in the second text box', () => {
    setup();
    expect(styleButtons()).toHaveLength(1);
    act(() => {
      secondBox().focus();
    });
    expect(styleButtons()).toHaveLength(1);
  });

  it('turns the cards and the boxes off when disabled', () => {
    setup({ disabled: true });
    expect(secondBox()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: t('admin.picture.remove') })).toBeDisabled();
  });
});

describe('ChapterWindow when pictures come and go', () => {
  it('removing the picture starts the text boxes again from the new items, reports nothing and keeps the toolbar', () => {
    const { view, full, onSlotChange } = setup();
    act(() => {
      secondBox().focus();
    });
    view.rerender(<ChapterWindow {...full} items={MERGED} />);
    expect(firstBox().textContent).toBe('BeforeAfter');
    expect(screen.queryByRole('textbox', { name: tf('admin.chapterWindow.slotLabel', { number: 1 }) })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('admin.picture.cardLabel') })).not.toBeInTheDocument();
    expect(styleButtons()).toHaveLength(1);
    expect(onSlotChange).not.toHaveBeenCalled();
  });

  it('adding a picture starts the text boxes again from the new items', () => {
    const { view, full, onSlotChange } = setup({ items: MERGED });
    expect(screen.queryByRole('region', { name: t('admin.picture.cardLabel') })).not.toBeInTheDocument();
    view.rerender(<ChapterWindow {...full} items={WITH_PICTURE} />);
    expect(firstBox().textContent).toBe('Before');
    expect(secondBox().textContent).toBe('After');
    expect(card()).toBeInTheDocument();
    expect(onSlotChange).not.toHaveBeenCalled();
  });

  it('a change of a number of the picture does not restart the text boxes', () => {
    const { view, full } = setup();
    typeInto(firstBox(), 'z');
    const wider: ContentItem[] = [
      { kind: 'slot', key: START_SLOT, text: 'zBefore' },
      { kind: 'picture', block: { ...PICTURE, width: 50 } },
      { kind: 'slot', key: PICTURE.id, text: 'After' },
    ];
    view.rerender(<ChapterWindow {...full} items={wider} />);
    expect(firstBox().textContent).toBe('zBefore');
    expect(screen.getByLabelText(t('admin.picture.widthLabel'))).toHaveValue('50');
  });
});
