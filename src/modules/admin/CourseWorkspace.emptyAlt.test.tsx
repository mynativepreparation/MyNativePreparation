import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, newTextBlock, type CourseDraft } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { CourseWorkspace } from './CourseWorkspace';

// P10 T11o O5 (3), decision: an EMPTY picture description is allowed through Save (see core/admin/problems.emptyAlt.test.ts).
// The window does NOT jump into a text box after a picture is inserted: that would open the phone keyboard over the picture card,
// and the person usually wants to set the position and size of the picture next.

const noEncoder: WebpEncoder = () => Promise.resolve(null);

function setup(picture: Block) {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [newTextBlock('title', 'Algebra'), newTextBlock('text', 'Before'), picture, newTextBlock('text', 'After')];
  draft.images = [{ path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }];
  const saved: CourseDraft[] = [];
  render(<CourseWorkspace draft={draft} busy={false} encodeWebp={noEncoder} onSave={(d) => saved.push(d)} onCancel={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: t('admin.editor.content') }));
  return { saved };
}

const save = () => fireEvent.click(screen.getByRole('button', { name: t('admin.course.save') }));
const altBox = () => screen.getByLabelText(t('admin.picture.altLabel'));
const pictureOf = (draft: CourseDraft) => draft.content.find((block) => block.type === 'image');

describe('CourseWorkspace: the picture description may be empty', () => {
  it('clearing the description saves an empty description and shows no list of problems', () => {
    const { saved } = setup({ id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: 'A cat' });
    fireEvent.change(altBox(), { target: { value: '' } });
    save();
    expect(saved).toHaveLength(1);
    expect(pictureOf(saved[0] as CourseDraft)?.alt).toBe('');
    expect(screen.queryByText(t('admin.problem.title'))).not.toBeInTheDocument();
  });

  it('a picture that already has an empty description saves, with its other fields unchanged', () => {
    const picture: Block = { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '', align: 'right', width: 40 };
    const { saved } = setup(picture);
    expect(altBox()).toHaveValue('');
    save();
    expect(saved).toHaveLength(1);
    expect(pictureOf(saved[0] as CourseDraft)).toEqual(picture);
    expect(screen.queryByText(t('admin.problem.title'))).not.toBeInTheDocument();
  });

  it('typing a description again after clearing it is saved', () => {
    const { saved } = setup({ id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: 'A cat' });
    fireEvent.change(altBox(), { target: { value: '' } });
    fireEvent.change(altBox(), { target: { value: 'A dog' } });
    save();
    expect(pictureOf(saved[0] as CourseDraft)?.alt).toBe('A dog');
  });
});
