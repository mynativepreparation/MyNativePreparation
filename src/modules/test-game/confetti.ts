// A small own confetti burst on a canvas for the test game result (P07 T4, DECISIONS Q18: no library).
// Rules: does nothing under "reduce motion"; at most MAX_PARTICLES pieces; runs about 2 seconds; asks the browser for a
// new animation frame ONLY while it is running; removes its canvas when it ends or when stop() is called.

export const MAX_PARTICLES = 120;
export const DEFAULT_PARTICLES = 90;
export const DEFAULT_DURATION_MS = 2000;

export interface ConfettiOptions {
  /** How many pieces (default 90, never more than 120). 0 or less: no confetti. */
  particles?: number;
  /** How long it lasts in milliseconds (default 2000). */
  durationMs?: number;
  /** Force the reduced-motion decision. Default: read the device setting `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  /** Random numbers in [0, 1]. Default Math.random; tests pass a fixed one. */
  random?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  /** Called once when the burst ends by itself (not when stop() was called). */
  onDone?: () => void;
}

const GRAVITY = 900; // pixels per second squared
const FADE_START = 0.7; // the last 30% of the time fades out
const TAU = Math.PI * 2;
/** Used only when the theme colours cannot be read. */
const FALLBACK_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5'];
const THEME_COLOR_VARIABLES = ['--np-color-accent', '--np-color-star', '--np-color-success', '--np-color-danger'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  color: string;
}

const noop = (): void => undefined;

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PARTICLES, Math.floor(value)));
}

/** Colours of the current theme (read from the CSS variables), so confetti matches light and dark. */
function themeColors(doc: Document): string[] {
  const colors: string[] = [];
  try {
    const style = doc.defaultView?.getComputedStyle(doc.documentElement);
    for (const name of THEME_COLOR_VARIABLES) {
      const value = style?.getPropertyValue(name).trim();
      if (value) colors.push(value);
    }
  } catch {
    // fall back below
  }
  return colors.length > 0 ? colors : FALLBACK_COLORS;
}

/**
 * Shoots confetti over the page. The canvas is added to `container`, covers the screen, ignores touches and is hidden from
 * screen readers. Returns `stop()`, which removes the canvas at once; calling it again does nothing.
 */
export function burst(container: HTMLElement, options: ConfettiOptions = {}): () => void {
  const count = clampCount(options.particles ?? DEFAULT_PARTICLES);
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  if (reduced || count === 0) return noop;

  const doc = container.ownerDocument;
  const view = doc.defaultView;
  const requestFrame =
    options.requestFrame ?? (view?.requestAnimationFrame ? view.requestAnimationFrame.bind(view) : null);
  const cancelFrame =
    options.cancelFrame ?? (view?.cancelAnimationFrame ? view.cancelAnimationFrame.bind(view) : noop);
  if (!requestFrame) return noop;

  const canvas = doc.createElement('canvas');
  const drawing = canvas.getContext('2d');
  if (!drawing) return noop;
  // Fresh constants with the narrowed (non-null) types, for the functions below.
  const context: CanvasRenderingContext2D = drawing;
  const schedule: (callback: FrameRequestCallback) => number = requestFrame;

  const random = options.random ?? Math.random;
  const duration = options.durationMs ?? DEFAULT_DURATION_MS;
  const width = view?.innerWidth || 360;
  const height = view?.innerHeight || 640;
  const colors = themeColors(doc);

  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-np-confetti', '');
  // Inline on purpose: the canvas lives only for 2 seconds. 1000 is the same layer as the toast.
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000';

  // All pieces start in a small cluster and shoot upwards in a fan.
  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = -Math.PI * (0.15 + 0.7 * random());
    const speed = 350 + 450 * random();
    return {
      x: width / 2 + (random() - 0.5) * width * 0.2,
      y: height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: 6 + 6 * random(),
      height: 4 + 6 * random(),
      rotation: random() * TAU,
      spin: (random() - 0.5) * 12,
      color: colors[Math.min(colors.length - 1, Math.floor(random() * colors.length))],
    };
  });

  let frameId: number | null = null;
  let finished = false;
  let startTime: number | null = null;
  let lastTime = 0;

  function finish(natural: boolean): void {
    if (finished) return;
    finished = true;
    if (frameId !== null) {
      try {
        cancelFrame(frameId);
      } catch {
        // ignored on purpose
      }
      frameId = null;
    }
    canvas.remove();
    if (natural) options.onDone?.();
  }

  function draw(dt: number, progress: number): void {
    context.clearRect(0, 0, width, height);
    const alpha = progress < FADE_START ? 1 : Math.max(0, (1 - progress) / (1 - FADE_START));
    for (const p of particles) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.globalAlpha = alpha;
      context.fillStyle = p.color;
      context.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      context.restore();
    }
  }

  function frame(time: number): void {
    frameId = null;
    if (finished) return;
    try {
      if (startTime === null) {
        startTime = time;
        lastTime = time - 16;
      }
      const elapsed = time - startTime;
      if (elapsed >= duration) {
        finish(true);
        return;
      }
      draw(Math.min(0.05, Math.max(0, (time - lastTime) / 1000)), elapsed / duration);
      lastTime = time;
      frameId = schedule(frame);
    } catch {
      finish(false); // any drawing problem just ends the show
    }
  }

  container.appendChild(canvas);
  try {
    frameId = schedule(frame);
  } catch {
    finish(false);
    return noop;
  }
  return () => finish(false);
}
