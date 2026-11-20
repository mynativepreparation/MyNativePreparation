import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { burst, DEFAULT_PARTICLES, MAX_PARTICLES, prefersReducedMotion } from './confetti';

// jsdom has no real canvas: getContext is replaced by a fake that records what is drawn.
function makeContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '' as string,
    globalAlpha: 1,
  };
}

// A hand-made animation-frame scheduler: nothing runs until the test calls step().
function makeFrames() {
  let nextId = 1;
  let now = 1000;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  return {
    cancelled,
    request: vi.fn((callback: FrameRequestCallback): number => {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    }),
    cancel: vi.fn((id: number): void => {
      cancelled.push(id);
      pending.delete(id);
    }),
    step(ms = 16): void {
      now += ms;
      const due = [...pending.values()];
      pending.clear();
      due.forEach((callback) => callback(now));
    },
    get pendingCount(): number {
      return pending.size;
    },
  };
}

let container: HTMLElement;
let fakeContext: ReturnType<typeof makeContext>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  fakeContext = makeContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  container.remove();
});

const canvasIn = (el: HTMLElement) => el.querySelector('canvas');

describe('reduced motion', () => {
  it('does nothing when reduced motion is forced: no canvas, no frame', () => {
    const frames = makeFrames();
    const stop = burst(container, { reducedMotion: true, requestFrame: frames.request, cancelFrame: frames.cancel });
    expect(canvasIn(container)).toBeNull();
    expect(frames.request).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('reads the device setting when it is not forced', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduce') }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(prefersReducedMotion()).toBe(true);
    const frames = makeFrames();
    burst(container, { requestFrame: frames.request, cancelFrame: frames.cancel });
    expect(canvasIn(container)).toBeNull();
    expect(frames.request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('plays when the device setting says no reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('treats a missing or broken matchMedia as "motion is fine"', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('broken');
    });
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('a normal burst', () => {
  it('adds a hidden, touch-through canvas to the container and asks for one frame', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, requestFrame: frames.request, cancelFrame: frames.cancel });
    const canvas = canvasIn(container);
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(frames.pendingCount).toBe(1);
  });

  it('draws every piece on every frame and moves the pieces between frames', () => {
    const frames = makeFrames();
    burst(container, {
      reducedMotion: false,
      particles: 10,
      random: () => 0.5,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
    });
    frames.step();
    expect(fakeContext.fillRect).toHaveBeenCalledTimes(10);
    expect(fakeContext.clearRect).toHaveBeenCalledTimes(1);
    const firstFrame = fakeContext.translate.mock.calls.slice(0, 10);

    frames.step();
    expect(fakeContext.fillRect).toHaveBeenCalledTimes(20);
    const secondFrame = fakeContext.translate.mock.calls.slice(10, 20);
    expect(secondFrame).not.toEqual(firstFrame);
  });

  it('uses the default number of pieces', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, requestFrame: frames.request, cancelFrame: frames.cancel });
    frames.step();
    expect(fakeContext.fillRect).toHaveBeenCalledTimes(DEFAULT_PARTICLES);
  });

  it('caps the number of pieces at 120', () => {
    expect(MAX_PARTICLES).toBe(120);
    const frames = makeFrames();
    burst(container, { reducedMotion: false, particles: 5000, requestFrame: frames.request, cancelFrame: frames.cancel });
    frames.step();
    expect(fakeContext.fillRect).toHaveBeenCalledTimes(MAX_PARTICLES);
  });

  it.each([0, -5, Number.NaN])('shows nothing for %s pieces', (particles) => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, particles, requestFrame: frames.request, cancelFrame: frames.cancel });
    expect(canvasIn(container)).toBeNull();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it('is repeatable with the same random numbers', () => {
    const run = () => {
      const frames = makeFrames();
      const ctx = makeContext();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
      burst(container, {
        reducedMotion: false,
        particles: 6,
        random: () => 0.25,
        requestFrame: frames.request,
        cancelFrame: frames.cancel,
      });
      frames.step();
      frames.step();
      return ctx.translate.mock.calls;
    };
    expect(run()).toEqual(run());
  });

  it('survives a random generator that returns exactly 1', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, particles: 5, random: () => 1, requestFrame: frames.request, cancelFrame: frames.cancel });
    frames.step();
    expect(fakeContext.fillRect).toHaveBeenCalledTimes(5);
    expect(fakeContext.fillStyle).not.toBe('');
  });

  it('draws with a non-empty colour even when the theme colours cannot be read', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, particles: 3, requestFrame: frames.request, cancelFrame: frames.cancel });
    frames.step();
    expect(typeof fakeContext.fillStyle).toBe('string');
    expect(fakeContext.fillStyle.length).toBeGreaterThan(0);
  });
});

describe('ending', () => {
  it('ends by itself after the duration: canvas removed, no more frames, onDone once', () => {
    const frames = makeFrames();
    const onDone = vi.fn();
    burst(container, {
      reducedMotion: false,
      durationMs: 1000,
      onDone,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
    });

    let simulated = 0;
    while (frames.pendingCount > 0 && simulated < 5000) {
      frames.step(100);
      simulated += 100;
    }

    expect(simulated).toBeGreaterThanOrEqual(1000);
    expect(simulated).toBeLessThanOrEqual(1300);
    expect(canvasIn(container)).toBeNull();
    expect(frames.pendingCount).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays quiet after it ended: no new frame is requested', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, durationMs: 300, requestFrame: frames.request, cancelFrame: frames.cancel });
    while (frames.pendingCount > 0) frames.step(100);
    const requested = frames.request.mock.calls.length;
    frames.step(100);
    frames.step(100);
    expect(frames.request.mock.calls.length).toBe(requested);
  });

  it('fades the pieces out at the end (alpha drops below 1 in the last part)', () => {
    const frames = makeFrames();
    burst(container, { reducedMotion: false, durationMs: 1000, particles: 2, requestFrame: frames.request, cancelFrame: frames.cancel });
    const alphas: number[] = [];
    Object.defineProperty(fakeContext, 'globalAlpha', {
      set: (value: number) => alphas.push(value),
      get: () => 1,
    });
    for (let i = 0; i < 9; i++) frames.step(100);
    expect(alphas[0]).toBe(1);
    expect(Math.min(...alphas)).toBeLessThan(1);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0);
  });

  it('stop() removes the canvas at once, cancels the pending frame and does not call onDone', () => {
    const frames = makeFrames();
    const onDone = vi.fn();
    const stop = burst(container, { reducedMotion: false, onDone, requestFrame: frames.request, cancelFrame: frames.cancel });
    frames.step();
    stop();
    expect(canvasIn(container)).toBeNull();
    expect(frames.cancelled).toHaveLength(1);
    expect(frames.pendingCount).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('stop() can be called twice, and after the end, without error', () => {
    const frames = makeFrames();
    const stop = burst(container, { reducedMotion: false, durationMs: 200, requestFrame: frames.request, cancelFrame: frames.cancel });
    stop();
    expect(() => stop()).not.toThrow();

    const other = makeFrames();
    const stopAfterEnd = burst(container, { reducedMotion: false, durationMs: 200, requestFrame: other.request, cancelFrame: other.cancel });
    while (other.pendingCount > 0) other.step(100);
    expect(() => stopAfterEnd()).not.toThrow();
    expect(canvasIn(container)).toBeNull();
  });
});

describe('when the browser cannot help', () => {
  it('does nothing when there is no 2D drawing context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const frames = makeFrames();
    expect(() =>
      burst(container, { reducedMotion: false, requestFrame: frames.request, cancelFrame: frames.cancel }),
    ).not.toThrow();
    expect(canvasIn(container)).toBeNull();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it('ends the show quietly when drawing throws', () => {
    const frames = makeFrames();
    fakeContext.fillRect.mockImplementation(() => {
      throw new Error('canvas lost');
    });
    const onDone = vi.fn();
    burst(container, { reducedMotion: false, onDone, requestFrame: frames.request, cancelFrame: frames.cancel });
    expect(() => frames.step()).not.toThrow();
    expect(canvasIn(container)).toBeNull();
    expect(frames.pendingCount).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('ends the show quietly when the first frame cannot be requested', () => {
    const request = vi.fn(() => {
      throw new Error('no frames');
    });
    expect(() => burst(container, { reducedMotion: false, requestFrame: request })).not.toThrow();
    expect(canvasIn(container)).toBeNull();
  });
});
