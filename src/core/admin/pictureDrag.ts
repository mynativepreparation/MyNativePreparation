import { IMAGE_HEIGHT_RANGE, IMAGE_WIDTH_RANGE, type ImageAlign } from '../content/types';

// The numbers behind the drag handles of the picture card (P10 T11o step O4). The card measures the column (the "stage") and the picture
// (the "frame") when a drag starts and gives these functions the pointer movement in pixels; they answer with whole percents inside the
// allowed ranges (the same ranges `updatePicture` in chapterSlots.ts clamps to), or with a position. Pure functions: no DOM, no storage.

interface Range {
  min: number;
  max: number;
}

/** A whole number inside the range. A number that is not finite counts as 100 (the whole column / the natural height). */
function whole(range: Range, value: number): number {
  const number = Number.isFinite(value) ? Math.round(value) : 100;
  return Math.min(Math.max(number, range.min), range.max);
}

export interface WidthDrag {
  /** The width of the picture when the drag started, in percent of the column. */
  startPercent: number;
  /** How far the pointer moved sideways since the start, in pixels (to the right is plus). */
  deltaPx: number;
  /** The width of the column in pixels. */
  stagePx: number;
  /** Where the picture sits; `undefined` is the middle. */
  align: ImageAlign | undefined;
}

export interface HeightDrag {
  /** The height of the picture when the drag started, in percent of its natural height. */
  startPercent: number;
  /** The height of the picture on the screen when the drag started, in pixels. */
  startPx: number;
  /** How far the pointer moved down since the start, in pixels (down is plus). */
  deltaPx: number;
}

export interface AlignDrag {
  pointerX: number;
  /** The left edge and the width of the column in pixels. */
  stageLeft: number;
  stagePx: number;
}

/**
 * The edge of the picture that carries the width handle: the one that moves. A picture on the right keeps its right edge, so its handle is
 * on the left; a picture on the left or in the middle has the handle on its right edge.
 */
export function widthHandleSide(align: ImageAlign | undefined): 'left' | 'right' {
  return align === 'right' ? 'left' : 'right';
}

/**
 * The new width while the width handle is dragged. The edge under the pointer follows it: a picture on the left grows by the movement, a
 * picture on the right by the movement the other way, and a picture in the middle by twice the movement (it grows to both sides).
 */
export function dragWidth(drag: WidthDrag): number {
  if (!(drag.stagePx > 0)) return whole(IMAGE_WIDTH_RANGE, drag.startPercent);
  const factor = drag.align === 'left' ? 1 : drag.align === 'right' ? -1 : 2;
  return whole(IMAGE_WIDTH_RANGE, drag.startPercent + (factor * drag.deltaPx * 100) / drag.stagePx);
}

/** The new height while the height handle (bottom edge) is dragged: the picture grows by the same share as its height on the screen. */
export function dragHeight(drag: HeightDrag): number {
  if (!(drag.startPx > 0)) return whole(IMAGE_HEIGHT_RANGE, drag.startPercent);
  return whole(IMAGE_HEIGHT_RANGE, (drag.startPercent * (drag.startPx + drag.deltaPx)) / drag.startPx);
}

/** The position that belongs to the pointer while the picture is slid: the left, middle or right third of the column. */
export function alignFromPointer(input: AlignDrag): ImageAlign {
  if (!(input.stagePx > 0)) return 'center';
  const place = (input.pointerX - input.stageLeft) / input.stagePx;
  if (place < 1 / 3) return 'left';
  if (place > 2 / 3) return 'right';
  return 'center';
}
