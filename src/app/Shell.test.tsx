import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomeScreen } from '../modules/home/HomeScreen';
import { Shell } from './Shell';

describe('Shell', () => {
  it('shows the toast text after the Home button emits ui.toast', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Shell />}>
            <Route index element={<HomeScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test the wire' }));
    expect(screen.getByRole('status')).toHaveTextContent('Hello from the wire');
  });
});
