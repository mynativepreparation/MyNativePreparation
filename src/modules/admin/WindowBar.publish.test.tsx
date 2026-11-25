import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { WindowBar } from './WindowBar';

// P11 T5 step b: the orange Publish button of the window bar. Without `onPublish` it stays off and the note says why (older tests);
// with `onPublish` it is on, the note is gone, and it is off while a save or a publish is running.

const publishButton = () => screen.getByRole('button', { name: t('admin.window.publish') });

describe('WindowBar: Publish', () => {
  it('stays off and shows the note when the window hands in no onPublish', () => {
    render(<WindowBar onSave={() => undefined} />);
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription(t('admin.window.publishNote'));
  });

  it('is on when onPublish is given, calls it once per click, and the note is gone', () => {
    const onPublish = vi.fn();
    render(<WindowBar onSave={() => undefined} onPublish={onPublish} />);
    expect(publishButton()).toBeEnabled();
    expect(screen.queryByText(t('admin.window.publishNote'))).not.toBeInTheDocument();
    fireEvent.click(publishButton());
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('is off while busy', () => {
    const onPublish = vi.fn();
    render(<WindowBar busy onSave={() => undefined} onPublish={onPublish} />);
    expect(publishButton()).toBeDisabled();
    fireEvent.click(publishButton());
    expect(onPublish).not.toHaveBeenCalled();
  });
});
