import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import { t } from '../../core/i18n';
import { CourseWorkspace } from './CourseWorkspace';

// P11 T5 step b: the Publish button of the course window runs the SAME checks as Save, then hands the draft up (the manager asks
// "really go live?" and sends it). Without `onPublish` the button stays off.

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const publishButton = () => screen.getByRole('button', { name: t('admin.window.publish') });

function setup(options: { busy?: boolean; withPublish?: boolean } = {}) {
  const published: CourseDraft[] = [];
  const saved: CourseDraft[] = [];
  render(
    <CourseWorkspace
      draft={createCourseDraft({ title: 'Maths' })}
      busy={options.busy ?? false}
      encodeWebp={noEncoder}
      onSave={(draft) => saved.push(draft)}
      onCancel={() => undefined}
      {...(options.withPublish === false ? {} : { onPublish: (draft: CourseDraft) => published.push(draft) })}
    />,
  );
  return { published, saved };
}

describe('CourseWorkspace: Publish', () => {
  it('hands the checked draft up once per click and does not save it', () => {
    const { published, saved } = setup();
    expect(publishButton()).toBeEnabled();
    fireEvent.click(publishButton());
    expect(published.map((draft) => draft.course.title)).toEqual(['Maths']);
    expect(saved).toEqual([]);
  });

  it('Save still hands up the draft and does not publish', () => {
    const { published, saved } = setup();
    fireEvent.click(screen.getByRole('button', { name: t('admin.course.save') }));
    expect(saved.map((draft) => draft.course.title)).toEqual(['Maths']);
    expect(published).toEqual([]);
  });

  it('stays off without onPublish', () => {
    const { published } = setup({ withPublish: false });
    expect(publishButton()).toBeDisabled();
    fireEvent.click(publishButton());
    expect(published).toEqual([]);
  });

  it('is off while busy', () => {
    const { published } = setup({ busy: true });
    expect(publishButton()).toBeDisabled();
    expect(published).toEqual([]);
  });
});
