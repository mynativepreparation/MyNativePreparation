import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { wire } from '../core/wire/wire';
import { Shell } from './Shell';

// A tiny stand-in screen: this test is about the Shell and the wire, not about Home (Home has its own tests).
function ToastButton() {
  return (
    <button type="button" onClick={() => wire.emit('ui.toast', { message: 'Hello from the wire' })}>
      Test the wire
    </button>
  );
}

describe('Shell', () => {
  it('shows the toast text after a screen emits ui.toast', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Shell />}>
            <Route index element={<ToastButton />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test the wire' }));
    expect(screen.getByRole('status')).toHaveTextContent('Hello from the wire');
  });
});
