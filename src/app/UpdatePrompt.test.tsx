import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../core/i18n';
import { resetUpdateState, setUpdateState } from '../core/update/updateStore';
import { UpdatePrompt } from './UpdatePrompt';

// P09 T1: UpdatePrompt now reads the update store (core/update) instead of registering the service worker itself.

afterEach(() => {
  resetUpdateState();
});

describe('UpdatePrompt', () => {
  it('shows nothing while no new version is waiting', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when a version is waiting but the app cannot apply it yet', () => {
    setUpdateState({ needRefresh: true });
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the alert with the button when a version is waiting; the button applies it', () => {
    const apply = vi.fn(() => Promise.resolve());
    render(<UpdatePrompt />);
    act(() => {
      setUpdateState({ needRefresh: true, apply });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(t('update.available'));
    fireEvent.click(screen.getByRole('button', { name: t('update.button') }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
