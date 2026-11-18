import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryScreen } from './GalleryScreen';

describe('GalleryScreen', () => {
  it('shows a section for every component', () => {
    render(<GalleryScreen />);
    for (const title of [
      'Layout check',
      'Button',
      'IconButton',
      'Card and Surface',
      'Tile',
      'Toggle',
      'TextField',
      'ProgressBar',
      'StarRating',
      'Toast',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('prints the layout check result', () => {
    render(<GalleryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Run layout check' }));
    expect(screen.getByText(/^OK \(width/)).toBeInTheDocument();
  });
});
