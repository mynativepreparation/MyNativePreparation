import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PicturePatch } from '../../core/admin/chapterSlots';
import { alignFromPointer, dragHeight, dragWidth } from '../../core/admin/pictureDrag';
import type { Block, ImageAlign } from '../../core/content/types';

// The drag handles of the picture card (P10 T11o step O4b, DECISIONS Q26 d). The card gives this hook its image block and the two
// elements it draws (the "stage" = the column, the "frame" = the picture with its handles). A pointer press on a handle or on the picture
// starts a drag; the window listens for the pointer, so the drag keeps working when the pointer leaves the handle (mouse, pen and touch).
// While the pointer is down only the picture ON THE SCREEN changes (a live value); ONE patch is reported when the pointer is released,
// so the chapter is edited once, not on every pixel. The numbers come from core/admin/pictureDrag.ts (pure).

export type DragKind = 'width' | 'height' | 'align';

type Session =
  | { kind: 'width'; startX: number; startPercent: number; stagePx: number; align: ImageAlign | undefined }
  | { kind: 'height'; startY: number; startPercent: number; startPx: number }
  | { kind: 'align'; stageLeft: number; stagePx: number; startAlign: ImageAlign };

interface Live {
  width?: number;
  height?: number;
  align?: ImageAlign;
}

/** What the picture looks like for the pointer position (x, y in screen pixels). */
function liveFor(session: Session, x: number, y: number): Live {
  if (session.kind === 'width') {
    return {
      width: dragWidth({ startPercent: session.startPercent, deltaPx: x - session.startX, stagePx: session.stagePx, align: session.align }),
    };
  }
  if (session.kind === 'height') {
    return { height: dragHeight({ startPercent: session.startPercent, startPx: session.startPx, deltaPx: y - session.startY }) };
  }
  return { align: alignFromPointer({ pointerX: x, stageLeft: session.stageLeft, stagePx: session.stagePx }) };
}

/** The ONE change to report when the pointer is released, or null when nothing changed (a plain press never edits the picture). */
function patchFor(session: Session, live: Live): PicturePatch | null {
  if (session.kind === 'width') {
    return live.width === undefined || live.width === session.startPercent ? null : { width: live.width };
  }
  if (session.kind === 'height') {
    return live.height === undefined || live.height === session.startPercent ? null : { height: live.height };
  }
  if (live.align === undefined || live.align === session.startAlign) return null;
  return { align: live.align === 'center' ? null : live.align };
}

export function usePictureDrag(block: Block, onChange: (patch: PicturePatch) => void, disabled: boolean) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [live, setLive] = useState<Live>({});
  const liveRef = useRef<Live>({});
  const reportRef = useRef(onChange);

  // The listeners below live as long as one drag, so they read the newest `onChange` through a ref.
  useEffect(() => {
    reportRef.current = onChange;
  });

  useEffect(() => {
    if (session === null) return undefined;

    const move = (event: PointerEvent) => {
      const next = liveFor(session, event.clientX, event.clientY);
      liveRef.current = next;
      setLive(next);
    };
    const finish = (commit: boolean) => {
      const patch = commit ? patchFor(session, liveRef.current) : null;
      liveRef.current = {};
      setLive({});
      setSession(null);
      if (patch !== null) reportRef.current(patch);
    };
    const release = () => finish(true);
    const cancel = () => finish(false);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [session]);

  /** Starts a drag. Only the main button / one finger counts; nothing starts while the card is disabled or another drag is running. */
  function begin(kind: DragKind, event: ReactPointerEvent<HTMLElement>) {
    if (disabled || session !== null || event.button > 0) return;
    const stage = stageRef.current?.getBoundingClientRect();
    const frame = frameRef.current?.getBoundingClientRect();
    if (stage === undefined || frame === undefined) return;
    event.preventDefault(); // no text selection and no native picture drag
    event.stopPropagation(); // a handle press must not also start the slide of the whole picture

    liveRef.current = {};
    setLive({});
    if (kind === 'width') {
      setSession({ kind, startX: event.clientX, startPercent: block.width ?? 100, stagePx: stage.width, align: block.align });
    } else if (kind === 'height') {
      setSession({ kind, startY: event.clientY, startPercent: block.height ?? 100, startPx: frame.height });
    } else {
      setSession({ kind, stageLeft: stage.left, stagePx: stage.width, startAlign: block.align ?? 'center' });
    }
  }

  return {
    stageRef,
    frameRef,
    begin,
    /** The drag that is running now, or null. */
    dragging: session === null ? null : session.kind,
    /** The numbers to show: the live ones while the pointer is down, otherwise the ones of the picture. */
    width: live.width ?? block.width,
    height: live.height ?? block.height,
    align: live.align ?? block.align,
  };
}
