import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { WindowBar, type WindowBarProps } from './WindowBar';

// The bottom bar only reports clicks; the course window decides what they do (P10 T11n C2).

function setup(props: Partial<WindowBarProps> = {}, chapterActions = true) {
  const onSave = vi.fn();
  const onAddChapter = vi.fn();
  const onToggleEdit = vi.fn();
  const onCancel = vi.fn();
  const actions = chapterActions ? { onAddChapter, onToggleEdit } : {};
  const full: WindowBarProps = { onSave, onCancel, ...actions, ...props };
  render(<WindowBar {...full} />);
  return { onSave, onAddChapter, onToggleEdit, onCancel };
}

const save = () => screen.getByRole('button', { name: t('admin.course.save') });
const edit = () => screen.getByRole('button', { name: t('admin.window.edit') });
const publish = () => screen.getByRole('button', { name: t('admin.window.publish') });
const add = () => screen.getByRole('button', { name: t('admin.window.add') });
const cancel = () => screen.getByRole('button', { name: t('admin.course.cancel') });

describe('WindowBar', () => {
  it('shows Save, Edit and Publish, then Add chapter, and every click is reported', () => {
    const { onSave, onAddChapter, onToggleEdit, onCancel } = setup();
    fireEvent.click(save());
    fireEvent.click(edit());
    fireEvent.click(add());
    fireEvent.click(cancel());
    expect([onSave, onToggleEdit, onAddChapter, onCancel].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('keeps Publish off and ties it to the note that says why', () => {
    setup();
    expect(publish()).toBeDisabled();
    expect(publish().getAttribute('aria-describedby')).toBe(screen.getByText(t('admin.window.publishNote')).id);
  });

  it('shows whether the chapter list is open on the Edit button', () => {
    setup({ editOpen: true });
    expect(edit()).toHaveAttribute('aria-expanded', 'true');
  });

  it('the Test part (no chapter actions) shows no Edit and no Add chapter', () => {
    setup({}, false);
    expect(screen.queryByRole('button', { name: t('admin.window.edit') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('admin.window.add') })).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('turns Save, Edit, Add chapter and Cancel off while busy', () => {
    setup({ busy: true });
    for (const button of [save(), edit(), add(), cancel()]) {
      expect(button).toBeDisabled();
    }
  });
});
