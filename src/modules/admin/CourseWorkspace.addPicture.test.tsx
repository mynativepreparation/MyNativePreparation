import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import { t } from '../../core/i18n';
import { CourseWorkspace } from './CourseWorkspace';
import { writeSelection } from './richBoxDom';

// Adding a picture with the toolbar's Add button (P10 T11o O3): file picker, `prepareImage`, then the picture goes into the text at the
// caret and the text is cut there. jsdom opens no file dialog, so the chosen file is a hand-made `change` event (like CoverField.test.tsx).

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(seed = 0): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set(PNG_HEAD);
  bytes[12] = seed;
  return bytes;
}

/** Content with one chapter: the title "Algebra" and ONE text block. */
function withText(text: string): CourseDraft {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [newTextBlock('title', 'Algebra'), newTextBlock('text', text)];
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
const addPicture = () => click(t('admin.toolbar.add'));
const titleBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.titleLabel') });
const contentBox = () => screen.getByRole('textbox', { name: t('admin.chapterWindow.contentLabel') });
const pictureCard = () => screen.findByRole('region', { name: t('admin.picture.cardLabel') });

function typeAt(root: HTMLElement, offset: number, text: string) {
  act(() => {
    root.focus();
  });
  writeSelection(root, { anchor: { line: 0, offset }, focus: { line: 0, offset } });
  fireEvent(root, new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
}

function chooseFile(bytes: Uint8Array, fileName: string) {
  const file = new File([bytes.slice()], fileName);
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.slice().buffer) });
  fireEvent.change(screen.getByLabelText(t('admin.picture.fileLabel')), { target: { files: [file] } });
}

const describePicture = () => fireEvent.change(screen.getByLabelText(t('admin.picture.altLabel')), { target: { value: 'A cat' } });

const typesOf = (draft: CourseDraft) => draft.content.map((block) => block.type);
const textsOf = (draft: CourseDraft) => draft.content.filter((block) => block.type === 'text').map((block) => block.text);
const pictureOf = (draft: CourseDraft) => draft.content.find((block) => block.type === 'image');

describe('CourseWorkspace: the Add picture button', () => {
  it('puts the chosen picture in at the caret and cuts the text there', async () => {
    const { saved } = setup(withText('HelloWorld'));
    typeAt(contentBox(), 5, 'X');
    addPicture();
    chooseFile(pngBytes(1), 'cat.png');
    expect(await pictureCard()).toBeInTheDocument();
    describePicture();
    save();
    const draft = saved[0] as CourseDraft;
    expect(typesOf(draft)).toEqual(['title', 'text', 'image', 'text']);
    expect(textsOf(draft)).toEqual(['HelloX', 'World']);
    expect(pictureOf(draft)?.alt).toBe('A cat');
    expect(draft.images.map((image) => image.mime)).toEqual(['image/png']);
    expect(draft.images.map((image) => image.path)).toEqual([pictureOf(draft)?.src]);
  });

  it('a picture added from the title box goes to the top of the content', async () => {
    const { saved } = setup(withText('Body'));
    act(() => {
      titleBox().focus();
    });
    addPicture();
    chooseFile(pngBytes(2), 'top.png');
    expect(await pictureCard()).toBeInTheDocument();
    describePicture();
    save();
    const draft = saved[0] as CourseDraft;
    expect(typesOf(draft)).toEqual(['title', 'image', 'text']);
    expect(textsOf(draft)).toEqual(['Body']);
  });

  it('refuses a file that is not a picture and changes nothing', async () => {
    const { saved } = setup(withText('Hello'));
    addPicture();
    chooseFile(new TextEncoder().encode('%PDF-1.7'), 'a.pdf');
    expect(await screen.findByText(t('admin.blocks.err.unsupported'))).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('admin.picture.cardLabel') })).not.toBeInTheDocument();
    save();
    const draft = saved[0] as CourseDraft;
    expect(typesOf(draft)).toEqual(['title', 'text']);
    expect(draft.images).toEqual([]);
  });

  it('the error goes away when the next file is a good one', async () => {
    setup(withText('Hello'));
    addPicture();
    chooseFile(new TextEncoder().encode('%PDF-1.7'), 'a.pdf');
    expect(await screen.findByText(t('admin.blocks.err.unsupported'))).toBeInTheDocument();
    addPicture();
    chooseFile(pngBytes(3), 'ok.png');
    expect(await pictureCard()).toBeInTheDocument();
    expect(screen.queryByText(t('admin.blocks.err.unsupported'))).not.toBeInTheDocument();
  });
});
