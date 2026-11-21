// The report layout draws ONLY on this interface. One adapter file per PDF library implements it (today: pdfLibSurface.ts),
// so swapping the library touches the adapter and nothing else.
//
// Coordinates are PDF points (1/72 inch) with the origin at the TOP-LEFT of the page and y growing downwards.
// The adapter flips them for the library. Strings are passed through unchanged (they may be Gujarati): font choice and
// shaping happen inside the adapter.

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

/** Red, green, blue, each from 0 to 1. */
export type Rgb = readonly [number, number, number];

export type Point = readonly [number, number];

export interface TextStyle {
  /** Font size in points. */
  size: number;
  bold?: boolean;
  /** Default: near-black. */
  color?: Rgb;
}

export interface PdfSurface {
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** Starts a new A4 portrait page; all drawing goes to the newest page. Must be called before the first drawing call. */
  addPage(): void;
  /** Width of the text in points, exactly as `text` would draw it. */
  measure(text: string, style: TextStyle): number;
  /** Draws one line of text; `baselineY` is the distance of the text baseline from the TOP of the page. */
  text(text: string, x: number, baselineY: number, style: TextStyle): void;
  /** Filled rectangle; (x, y) is its top-left corner. */
  rect(x: number, y: number, width: number, height: number, fill: Rgb): void;
  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width: number): void;
  /** Filled closed polygon through the points (stars, arrows). */
  path(points: readonly Point[], fill: Rgb): void;
  /** Ends the document and returns the PDF bytes. `title` goes into the PDF metadata (Gujarati allowed). */
  finish(meta: { title: string }): Promise<Uint8Array>;
}
