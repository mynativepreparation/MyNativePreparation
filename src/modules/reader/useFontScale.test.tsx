import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_SCALE_KEY, useFontScale } from './useFontScale';

function Harness() {
  const { scale, increase, decrease, pinchHandlers } = useFontScale();
  return (
    <div>
      <div data-testid="area" {...pinchHandlers} />
      <output data-testid="scale">{scale}</output>
      <button onClick={increase}>inc</button>
      <button onClick={decrease}>dec</button>
    </div>
  );
}

const scaleText = () => screen.getByTestId('scale').textContent;
const area = () => screen.getByTestId('area');
const down = (pointerId: number, x: number) => fireEvent.pointerDown(area(), { pointerId, clientX: x, clientY: 0 });
const move = (pointerId: number, x: number) => fireEvent.pointerMove(area(), { pointerId, clientX: x, clientY: 0 });
const up = (pointerId: number) => fireEvent.pointerUp(area(), { pointerId });

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useFontScale: start value and memory', () => {
  it('starts at 1 when nothing is stored', () => {
    render(<Harness />);
    expect(scaleText()).toBe('1');
  });

  it('starts from the remembered size', () => {
    window.localStorage.setItem(FONT_SCALE_KEY, '1.4');
    render(<Harness />);
    expect(scaleText()).toBe('1.4');
  });

  it.each([
    ['abc', '1'],
    ['', '1'],
    ['9', '2'],
    ['0.1', '0.8'],
  ])('a stored value of %j gives %s', (stored, expected) => {
    window.localStorage.setItem(FONT_SCALE_KEY, stored);
    render(<Harness />);
    expect(scaleText()).toBe(expected);
  });

  it('remembers a change', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('inc'));
    expect(window.localStorage.getItem(FONT_SCALE_KEY)).toBe('1.1');
  });

  it('keeps working when reading or writing the storage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<Harness />);
    expect(scaleText()).toBe('1');
    fireEvent.click(screen.getByText('inc'));
    expect(scaleText()).toBe('1.1');
  });
});

describe('useFontScale: A- / A+', () => {
  it('changes in steps of 0.1 and stops at 0.8 and 2', () => {
    render(<Harness />);
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByText('inc'));
    expect(scaleText()).toBe('2');
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByText('dec'));
    expect(scaleText()).toBe('0.8');
  });

  it('shows 1.1 and 1.2 without rounding noise', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('inc'));
    expect(scaleText()).toBe('1.1');
    fireEvent.click(screen.getByText('inc'));
    expect(scaleText()).toBe('1.2');
  });
});

describe('useFontScale: two-finger pinch', () => {
  it('makes the text bigger when the fingers move apart', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    move(2, 150);
    expect(scaleText()).toBe('1.5');
    expect(window.localStorage.getItem(FONT_SCALE_KEY)).toBe('1.5');
  });

  it('makes the text smaller when the fingers move together', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    move(2, 90);
    expect(scaleText()).toBe('0.9');
  });

  it('never goes beyond 0.8 and 2', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    move(2, 400);
    expect(scaleText()).toBe('2');
    move(2, 10);
    expect(scaleText()).toBe('0.8');
  });

  it('ignores one finger (the page just scrolls)', () => {
    render(<Harness />);
    down(1, 0);
    move(1, 300);
    expect(scaleText()).toBe('1');
  });

  it('ignores a finger that was never put down', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    move(7, 500);
    expect(scaleText()).toBe('1');
  });

  it('stops pinching when a finger is lifted and starts again from the current size', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    move(2, 150); // 1.5
    up(1);
    move(2, 300);
    expect(scaleText()).toBe('1.5'); // one finger left: no change
    down(1, 200); // second pinch: 100 apart again
    act(() => {
      move(1, 150); // distance 150 -> 1.5 x 1.5 = 2.25 -> clamped to 2
    });
    expect(scaleText()).toBe('2');
  });

  it('a cancelled touch ends the pinch', () => {
    render(<Harness />);
    down(1, 0);
    down(2, 100);
    fireEvent.pointerCancel(area(), { pointerId: 1 });
    move(2, 200);
    expect(scaleText()).toBe('1');
  });
});
