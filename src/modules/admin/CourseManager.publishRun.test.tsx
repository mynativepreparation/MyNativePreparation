import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRecord, DraftStore, StoreResult } from '../../core/admin/draftStore';
import { createCourseDraft, type CourseDraft } from '../../core/admin/model';
import type { PublishDeps, PublishOutcome } from '../../core/admin/publishRun';
import { t, tf } from '../../core/i18n';
import { CourseManager } from './CourseManager';
import { login, logout } from './session';
import type { PublishRuns, UsePublishDeps } from './usePublish';

// P11 T5 step b: Publish / Unpublish in the course list and in the course window. No network: the two runs are fakes.
// What is proved: logged out everything is off; the question comes first and Cancel does nothing; Yes starts ONE run; while it runs the
// buttons are off and the line says what is going on; the result and every error show as one friendly line; Close clears it.

const maths = createCourseDraft({ title: 'Maths', order: 1 });
const english = createCourseDraft({ title: 'English', order: 2 });

function storeWith(drafts: CourseDraft[]): DraftStore {
  const rows: DraftRecord[] = drafts.map((d, i) => ({ id: d.course.id, draft: d, deleted: false, updatedAt: i }));
  const answer = <T,>(value: T): Promise<StoreResult<T>> => Promise.resolve<StoreResult<T>>({ ok: true, value });
  return {
    list: () => answer(rows),
    get: (id) => answer(rows.find((r) => r.id === id)),
    put: (draft) => answer({ id: draft.course.id, draft, deleted: false, updatedAt: 9 }),
    markDeleted: () => answer(true),
    remove: () => answer(true as const),
    close: () => undefined,
  };
}

const PUBLISHED: PublishOutcome = { ok: true, unchanged: false, courseId: maths.course.id, version: 3, commitSha: 'abcdef1234567890' };

function fakeRuns(outcome: PublishOutcome) {
  const publish = vi.fn<PublishRuns['publish']>(() => Promise.resolve(outcome));
  const unpublish = vi.fn<PublishRuns['unpublish']>(() => Promise.resolve(outcome));
  const deps: UsePublishDeps = { runs: { publish, unpublish }, tokenOf: () => 'ghp_test' };
  return { publish, unpublish, deps };
}

function setup(outcome: PublishOutcome = PUBLISHED) {
  const fake = fakeRuns(outcome);
  render(<CourseManager store={storeWith([maths, english])} publishDeps={fake.deps} />);
  return fake;
}

const publishButton = (title: string) => screen.getByRole('button', { name: tf('admin.courses.publishNamed', { title }) });
const unpublishButton = (title: string) => screen.getByRole('button', { name: tf('admin.courses.unpublishNamed', { title }) });
const publishGroup = (title: string) => screen.getByRole('group', { name: tf('admin.publish.confirmPublishLabel', { title }) });
const unpublishGroup = (title: string) => screen.getByRole('group', { name: tf('admin.publish.confirmUnpublishLabel', { title }) });

beforeEach(() => {
  act(() => {
    login('ghp_test', { fullName: 'mynativepreparation/MyNativePreparation', defaultBranch: 'main', branchOk: true });
  });
});

afterEach(() => {
  act(() => {
    logout();
  });
});

describe('CourseManager: Publish and Unpublish need the login', () => {
  it('logged out: both buttons are off and the note is shown', async () => {
    act(() => {
      logout();
    });
    setup();
    await screen.findByText('Maths');
    expect(publishButton('Maths')).toBeDisabled();
    expect(unpublishButton('Maths')).toBeDisabled();
    expect(screen.getAllByText(t('admin.courses.publishNote'))).toHaveLength(1);
  });

  it('logged in: both buttons are on for every course and the note is gone', async () => {
    setup();
    await screen.findByText('Maths');
    for (const title of ['Maths', 'English']) {
      expect(publishButton(title)).toBeEnabled();
      expect(unpublishButton(title)).toBeEnabled();
    }
    expect(screen.queryByText(t('admin.courses.publishNote'))).not.toBeInTheDocument();
  });
});

describe('CourseManager: the question comes first', () => {
  it('Publish asks "this goes live for everyone" with the title and starts nothing', async () => {
    const fake = setup();
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    const group = publishGroup('Maths');
    expect(within(group).getByText(tf('admin.publish.confirmPublishText', { title: 'Maths' }))).toBeInTheDocument();
    expect(fake.publish).not.toHaveBeenCalled();
    expect(fake.unpublish).not.toHaveBeenCalled();
  });

  it('Unpublish asks "the course disappears for everyone" with the title and starts nothing', async () => {
    const fake = setup();
    await screen.findByText('English');
    fireEvent.click(unpublishButton('English'));
    const group = unpublishGroup('English');
    expect(within(group).getByText(tf('admin.publish.confirmUnpublishText', { title: 'English' }))).toBeInTheDocument();
    expect(fake.unpublish).not.toHaveBeenCalled();
  });

  it('Cancel closes the question and nothing is sent', async () => {
    const fake = setup();
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.cancel') }));
    expect(screen.queryByRole('group', { name: tf('admin.publish.confirmPublishLabel', { title: 'Maths' }) })).not.toBeInTheDocument();
    expect(publishButton('Maths')).toBeEnabled();
    expect(fake.publish).not.toHaveBeenCalled();
  });
});

describe('CourseManager: Yes starts ONE run and shows the result', () => {
  it('Publish: calls the run once with the draft, then shows "Published" and the 7-character commit id', async () => {
    const fake = setup();
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.done'))).toBeInTheDocument();
    expect(screen.getByText(tf('admin.publish.commit', { id: 'abcdef1' }))).toBeInTheDocument();
    expect(fake.publish.mock.calls.map(([, draft]) => draft.course.id)).toEqual([maths.course.id]);
    expect(fake.unpublish).not.toHaveBeenCalled();
  });

  it('Unpublish: calls the run once with the course id and title, then shows "Unpublished"', async () => {
    const fake = setup({ ok: true, unchanged: false, courseId: english.course.id, version: 2, commitSha: '1234567abcdef' });
    await screen.findByText('English');
    fireEvent.click(unpublishButton('English'));
    fireEvent.click(within(unpublishGroup('English')).getByRole('button', { name: t('admin.publish.confirmUnpublishYes') }));
    expect(await screen.findByText(t('admin.publish.unpublished'))).toBeInTheDocument();
    expect(fake.unpublish.mock.calls.map(([, course]) => course)).toEqual([{ courseId: english.course.id, title: 'English' }]);
    expect(fake.publish).not.toHaveBeenCalled();
  });

  it('nothing changed: shows "Nothing to publish" and no commit id', async () => {
    setup({ ok: true, unchanged: true, courseId: maths.course.id, version: 3, commitSha: null });
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.unchanged'))).toBeInTheDocument();
    expect(screen.queryByText(/^Commit /)).not.toBeInTheDocument();
  });

  it('Close clears the result', async () => {
    setup();
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    await screen.findByText(t('admin.publish.done'));
    fireEvent.click(screen.getByRole('button', { name: t('admin.publish.close') }));
    expect(screen.queryByText(t('admin.publish.done'))).not.toBeInTheDocument();
  });
});

describe('CourseManager: while a run is going', () => {
  it('the buttons are off, the line says Checking... then Uploading..., and the result comes after', async () => {
    const hold: { step: PublishDeps['onStep'] } = { step: undefined };
    let release: (outcome: PublishOutcome) => void = () => undefined;
    const held = new Promise<PublishOutcome>((resolve) => {
      release = resolve;
    });
    const publish = vi.fn<PublishRuns['publish']>((deps) => {
      hold.step = deps.onStep;
      return held;
    });
    const unpublish = vi.fn<PublishRuns['unpublish']>(() => held);
    render(<CourseManager store={storeWith([maths, english])} publishDeps={{ runs: { publish, unpublish }, tokenOf: () => 'ghp_test' }} />);
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));

    expect(await screen.findByText(t('admin.publish.checking'))).toBeInTheDocument();
    for (const title of ['Maths', 'English']) {
      expect(publishButton(title)).toBeDisabled();
      expect(unpublishButton(title)).toBeDisabled();
    }
    act(() => {
      hold.step?.('uploading');
    });
    expect(screen.getByText(t('admin.publish.uploading'))).toBeInTheDocument();

    await act(async () => {
      release(PUBLISHED);
      await held;
    });
    expect(screen.getByText(t('admin.publish.done'))).toBeInTheDocument();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publishButton('Maths')).toBeEnabled();
  });
});

describe('CourseManager: errors are one friendly line', () => {
  it('conflict: "Someone else published at the same time. Try again."', async () => {
    setup({ ok: false, code: 'conflict', errors: [] });
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.err.conflict'))).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Someone else published at the same time. Try again.');
  });

  it('a GitHub code reuses the login text', async () => {
    setup({ ok: false, code: 'rate_limited', errors: [] });
    await screen.findByText('Maths');
    fireEvent.click(unpublishButton('Maths'));
    fireEvent.click(within(unpublishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmUnpublishYes') }));
    expect(await screen.findByText(t('admin.err.rateLimited'))).toBeInTheDocument();
  });

  it('invalid: the line and the first 3 problems only', async () => {
    setup({ ok: false, code: 'invalid', errors: ['Problem one', 'Problem two', 'Problem three', 'Problem four'] });
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.err.invalid'))).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent).filter((text) => (text ?? '').startsWith('Problem'))).toEqual([
      'Problem one',
      'Problem two',
      'Problem three',
    ]);
    expect(screen.queryByText('Problem four')).not.toBeInTheDocument();
  });

  it('other codes list no problems', async () => {
    setup({ ok: false, code: 'too_large', errors: ['Picture too big'] });
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.err.tooLarge'))).toBeInTheDocument();
    expect(screen.queryByText('Picture too big')).not.toBeInTheDocument();
  });

  it('the token is gone from the session before the run: "Log in first."', async () => {
    const fake = fakeRuns(PUBLISHED);
    render(<CourseManager store={storeWith([maths])} publishDeps={{ runs: fake, tokenOf: () => null }} />);
    await screen.findByText('Maths');
    fireEvent.click(publishButton('Maths'));
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.err.notLoggedIn'))).toBeInTheDocument();
    expect(fake.publish).not.toHaveBeenCalled();
  });
});

describe('CourseManager: Publish in the course window', () => {
  it('asks first, then publishes the draft of the open course', async () => {
    const fake = setup();
    await screen.findByText('Maths');
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: 'Maths' }) }));
    const bar = await screen.findByRole('button', { name: t('admin.window.publish') });
    expect(bar).toBeEnabled();
    expect(screen.queryByText(t('admin.window.publishNote'))).not.toBeInTheDocument();
    fireEvent.click(bar);
    expect(fake.publish).not.toHaveBeenCalled();
    fireEvent.click(within(publishGroup('Maths')).getByRole('button', { name: t('admin.publish.confirmPublishYes') }));
    expect(await screen.findByText(t('admin.publish.done'))).toBeInTheDocument();
    await waitFor(() => expect(fake.publish).toHaveBeenCalledTimes(1));
    expect(fake.publish.mock.calls.map(([, draft]) => draft.course.title)).toEqual(['Maths']);
    // the window stays open: Save is still there
    expect(screen.getByRole('button', { name: t('admin.course.save') })).toBeInTheDocument();
  });

  it('logged out: the window Publish is off and the note is shown', async () => {
    act(() => {
      logout();
    });
    setup();
    await screen.findByText('Maths');
    fireEvent.click(screen.getByRole('button', { name: tf('admin.courses.editNamed', { title: 'Maths' }) }));
    const bar = await screen.findByRole('button', { name: t('admin.window.publish') });
    expect(bar).toBeDisabled();
    expect(screen.getByText(t('admin.window.publishNote'))).toBeInTheDocument();
  });
});
