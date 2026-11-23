import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { START_SLOT, type ContentItem, type PicturePatch } from '../../core/admin/chapterSlots';
import { t } from '../../core/i18n';
import { ChapterWindow, type ChapterWindowProps } from './ChapterWindow';
import { writeSelection } from './richBoxDom';

// The chapter window (P10 T11n C1, rebuilt in T11o O2): one toolbar over the Title, Subtitle and Content boxes. This file covers a chapter
// with no picture (one text box); the text boxes around pictures are in ChapterWindow.pictures.test.tsx. jsdom has no keyboard, so typing
// is a hand-made `beforeinput` event (the same way RichBox.test.tsx does it).

const oneSlot = (text = ''): ContentItem[] => [{ kind: 'slot', key: START_SLOT, text }];

function setup(props: Partial<ChapterWindowProps> = {}) {
  const handlers = {
    onTitleChange: vi.fn<(text: string) => void>(),
    onSubtitleChange: vi.fn<(text: string) => void>(),
    onSlotChange: vi.fn<(key: string, text: string) => void>(),
    onPictureChange: vi.fn<(id: string, patch: PicturePatch) => void>(),
    onPictureRemove: vi.fn<(id: string) => void>(),
  };
  const full: ChapterWindowProps = { chapterKey: 'a', title: '', subtitle: '', items: oneSlot(), ...handlers, ...props };
  const view = render(<ChapterWindow {...full} />);
  return { ...handlers, view, full };
}

const titleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.titleLabel') });
const subtitleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.subtitleLabel') });
const contentBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });
const styleButtons = () => screen.getAllByRole('button', { name: t('admin.toolbar.style') });

function typeInto(root: HTMLElement, text: string) {
  root.focus();
  writeSelection(root, { anchor: { line: 0, offset: 0 }, focus: { line: 0, offset: 0 } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

const lastText = (fn: { mock: { calls: Array<[string]> } }): string[] => fn.mock.calls.map(([text]) => text).slice(-1);

describe('ChapterWindow: what it shows', () => {
  it('has the toolbar and three labelled boxes with their placeholders, and reports nothing when it opens', () => {
    const handlers = setup();
    expect(styleButtons()).toHaveLength(1);
    expect(titleBox()).toHaveAttribute('data-placeholder', t('admin.chapterWindow.titlePlaceholder'));
    expect(subtitleBox()).toHaveAttribute('data-placeholder', t('admin.chapterWindow.subtitlePlaceholder'));
    expect(contentBox()).toHaveAttribute('data-placeholder', t('admin.chapterWindow.contentPlaceholder'));
    expect(titleBox()).toHaveAttribute('aria-multiline', 'false');
    expect(subtitleBox()).toHaveAttribute('aria-multiline', 'false');
    expect(contentBox()).toHaveAttribute('aria-multiline', 'true');
    expect(handlers.onTitleChange).not.toHaveBeenCalled();
    expect(handlers.onSubtitleChange).not.toHaveBeenCalled();
    expect(handlers.onSlotChange).not.toHaveBeenCalled();
  });

  it('shows the saved texts of the chapter', () => {
    setup({ title: 'Head', subtitle: 'Sub', items: oneSlot('Body') });
    expect(titleBox().textContent).toBe('Head');
    expect(subtitleBox().textContent).toBe('Sub');
    expect(contentBox().textContent).toBe('Body');
  });

  it('turns every box off when disabled', () => {
    setup({ disabled: true });
    for (const box of [titleBox(), subtitleBox(), contentBox()]) {
      expect(box).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('has no picture card while the chapter has no picture', () => {
    setup();
    expect(screen.queryByRole('region', { name: t('admin.picture.cardLabel') })).not.toBeInTheDocument();
  });
});

describe('ChapterWindow: editing', () => {
  it('typing in the title reports only the title', () => {
    const { onTitleChange, onSubtitleChange, onSlotChange } = setup({ subtitle: 'Sub', items: oneSlot('Body') });
    typeInto(titleBox(), 'Hi');
    expect(lastText(onTitleChange)).toEqual(['Hi']);
    expect(onSubtitleChange).not.toHaveBeenCalled();
    expect(onSlotChange).not.toHaveBeenCalled();
  });

  it('typing in the subtitle reports only the subtitle', () => {
    const { onTitleChange, onSubtitleChange } = setup({ title: 'T' });
    typeInto(subtitleBox(), 'Sub');
    expect(lastText(onSubtitleChange)).toEqual(['Sub']);
    expect(onTitleChange).not.toHaveBeenCalled();
  });

  it('typing in the content reports the text of its slot', () => {
    const { onTitleChange, onSlotChange } = setup({ items: oneSlot('Body') });
    typeInto(contentBox(), 'x');
    expect(onSlotChange.mock.calls.map(([key, text]) => [key, text]).slice(-1)).toEqual([[START_SLOT, 'xBody']]);
    expect(onTitleChange).not.toHaveBeenCalled();
  });

  it('the toolbar works on the box that has the focus', () => {
    const { onSubtitleChange, onSlotChange } = setup({ title: 'T', subtitle: 'abc', items: oneSlot('xyz') });
    act(() => {
      subtitleBox().focus();
    });
    fireEvent.click(styleButtons()[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: t('admin.toolbar.bullets') }));
    expect(lastText(onSubtitleChange)).toEqual(['- abc']);
    expect(onSlotChange).not.toHaveBeenCalled();
  });

  it('there is only ever ONE toolbar, whichever box has the focus', () => {
    setup({ items: oneSlot('Body') });
    expect(styleButtons()).toHaveLength(1);
    act(() => {
      titleBox().focus();
    });
    expect(styleButtons()).toHaveLength(1);
    act(() => {
      contentBox().focus();
    });
    expect(styleButtons()).toHaveLength(1);
  });
});

describe('ChapterWindow: opening another chapter', () => {
  it('a new chapterKey starts the boxes again from the new texts and reports nothing', () => {
    const handlers = setup({ title: 'Old', subtitle: '', items: oneSlot('Old body') });
    handlers.view.rerender(
      <ChapterWindow {...handlers.full} chapterKey="b" title="New" subtitle="New sub" items={oneSlot('')} />,
    );
    expect(titleBox().textContent).toBe('New');
    expect(subtitleBox().textContent).toBe('New sub');
    expect(contentBox().textContent).toBe('');
    expect(handlers.onTitleChange).not.toHaveBeenCalled();
    expect(handlers.onSubtitleChange).not.toHaveBeenCalled();
    expect(handlers.onSlotChange).not.toHaveBeenCalled();
  });
});
