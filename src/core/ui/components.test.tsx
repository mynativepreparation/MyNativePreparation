import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  Card,
  IconButton,
  ProgressBar,
  StarRating,
  Surface,
  TextField,
  Tile,
  Toast,
  Toggle,
} from './index';

describe('design system components', () => {
  it('Card renders its children', () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText('Card body')).toHaveClass('np-card');
  });

  it('Surface renders its children', () => {
    render(<Surface>Inset body</Surface>);
    expect(screen.getByText('Inset body')).toHaveClass('np-surface');
  });

  it('Button has the button role and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Button secondary + large variants set their classes', () => {
    render(
      <Button variant="secondary" size="lg">
        Cancel
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('np-button--secondary', 'np-button--lg');
  });

  it('IconButton is named by its label', () => {
    render(<IconButton icon={<span>x</span>} label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('Tile shows title and subtitle and is a button', () => {
    render(<Tile icon={<span>i</span>} title="Courses" subtitle="3 available" />);
    const tile = screen.getByRole('button', { name: /Courses/ });
    expect(tile).toHaveTextContent('3 available');
  });

  it('Toggle is a switch and reports the new value', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Sound" />);
    const sw = screen.getByRole('switch', { name: 'Sound' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('TextField links the label and shows an error', () => {
    render(<TextField label="Name" error="Required" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Required/);
  });

  it('ProgressBar exposes progressbar values and clamps', () => {
    render(<ProgressBar value={150} label="Course progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Course progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('StarRating has an image role with a text label', () => {
    render(<StarRating value={3} />);
    expect(screen.getByRole('img', { name: '3 of 5 stars' })).toBeInTheDocument();
  });

  it('Toast has the status role', () => {
    render(<Toast message="Saved" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
