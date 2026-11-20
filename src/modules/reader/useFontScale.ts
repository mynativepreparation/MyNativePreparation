import { useCallback, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { clampScale, DEFAULT_SCALE, pinchScale } from './readerMath';

/** localStorage key: a plain number (the font scale), not personal data. */
export const FONT_SCALE_KEY = 'np.reader.fontScale';
/** Size change of one `A-` / `A+` press. */
export const FONT_STEP = 0.1;

const round1 = (value: number) => Math.round(value * 10) / 10;

function loadScale(): number {
  try {
    const raw = window.localStorage.getItem(FONT_SCALE_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_SCALE;
    return clampScale(Number(raw)); // "abc" gives NaN, which clampScale turns into DEFAULT_SCALE
  } catch {
    return DEFAULT_SCALE; // storage blocked or broken: the reader still works
  }
}

function saveScale(value: number): void {
  try {
    window.localStorage.setItem(FONT_SCALE_KEY, String(value));
  } catch {
    // ignore: the size just is not remembered
  }
}

/**
 * Font scale of the reader (0.8 to 2.0, start 1.0, remembered). Spread `pinchHandlers` on the reading
 * area: two fingers moving apart / together change the size; one finger is left alone so the page scrolls.
 */
export function useFontScale() {
  const [scale, setScaleState] = useState(loadScale);
  const scaleRef = useRef(scale);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ startDistance: number; startScale: number } | null>(null);

  const setScale = useCallback((next: number) => {
    const value = clampScale(next);
    scaleRef.current = value;
    setScaleState(value);
    saveScale(value);
  }, []);

  const increase = useCallback(() => setScale(round1(scaleRef.current + FONT_STEP)), [setScale]);
  const decrease = useCallback(() => setScale(round1(scaleRef.current - FONT_STEP)), [setScale]);

  const distanceOfTwo = (): number => {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { startDistance: distanceOfTwo(), startScale: scaleRef.current };
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      setScale(pinchScale(pinch.current.startDistance, distanceOfTwo(), pinch.current.startScale));
    }
  };

  const onPointerEnd = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  return {
    scale,
    setScale,
    increase,
    decrease,
    pinchHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
