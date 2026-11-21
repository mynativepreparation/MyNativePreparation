// PdfSurface on top of pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 (the T2 spike winner, DECISIONS Q21): real, selectable text with
// correct Gujarati shaping. Load this file ONLY through `import()` (it is the heavy PDF chunk); nothing else may import it statically.
//
// What the spike found, and what this file does about it:
//  1. The fontkit fork needs the global `regeneratorRuntime`  -> `regenerator-runtime/runtime` is imported FIRST.
//  2. Its subsetter crashes on woff2 fonts                    -> only the WOFF files are used, always embedded with subset: true
//     (non-subset embedding would copy the WOFF bytes into the PDF as a "font program", which no viewer can read).
//  3. GPOS mark positioning crashes on a null anchor            -> gposGuard.ts, installed before the first layout.
// Gujarati and Latin text come from two font files, so every string is split into runs (runs.ts) and each run is drawn
// with its own font; the text itself is passed through unchanged.

import 'regenerator-runtime/runtime';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import * as fontkitModule from '@pdf-lib/fontkit';
import { installGposGuard, type FontkitLike } from './gposGuard';
import { splitRuns, type Script } from './runs';
import { A4_HEIGHT, A4_WIDTH, type PdfSurface, type Rgb } from './surface';

/** Reads one font file by name (for example `noto-sans-gujarati-latin-400-normal.woff`) and returns its bytes. */
export type FontLoader = (fileName: string) => Promise<Uint8Array>;

export const FONT_FILES = {
  gujarati: {
    regular: 'noto-sans-gujarati-gujarati-400-normal.woff',
    bold: 'noto-sans-gujarati-gujarati-700-normal.woff',
  },
  latin: {
    regular: 'noto-sans-gujarati-latin-400-normal.woff',
    bold: 'noto-sans-gujarati-latin-700-normal.woff',
  },
} as const;

/** Default loader: the app serves the fonts from `public/fonts/` (kept in the PWA precache, so the report works offline). */
export const fetchFont: FontLoader = async (fileName) => {
  const response = await fetch(import.meta.env.BASE_URL + 'fonts/' + fileName);
  if (!response.ok) throw new Error('Font file could not be loaded: ' + fileName + ' (HTTP ' + response.status + ')');
  return new Uint8Array(await response.arrayBuffer());
};

/** The fontkit package is CommonJS/UMD in some setups and ESM in others: find the object that has `create()`. */
export function pickFontkit(moduleValue: unknown): FontkitLike {
  let candidate: unknown = moduleValue;
  for (let depth = 0; depth < 3; depth += 1) {
    if ((typeof candidate !== 'object' && typeof candidate !== 'function') || candidate === null) break;
    const holder = candidate as { create?: unknown; default?: unknown };
    if (typeof holder.create === 'function') return holder as FontkitLike;
    candidate = holder.default;
  }
  throw new Error('@pdf-lib/fontkit: no create() function found in the imported module.');
}

const DEFAULT_TEXT_COLOR: Rgb = [0.1, 0.1, 0.1];
const toColor = (color: Rgb) => rgb(color[0], color[1], color[2]);

export async function createPdfLibSurface(loadFont: FontLoader = fetchFont): Promise<PdfSurface> {
  const [gujaratiRegular, gujaratiBold, latinRegular, latinBold] = await Promise.all([
    loadFont(FONT_FILES.gujarati.regular),
    loadFont(FONT_FILES.gujarati.bold),
    loadFont(FONT_FILES.latin.regular),
    loadFont(FONT_FILES.latin.bold),
  ]);

  const fontkit = pickFontkit(fontkitModule);
  installGposGuard(fontkit, gujaratiRegular); // must happen before the first Gujarati layout

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
  const fonts: Record<Script, { regular: PDFFont; bold: PDFFont }> = {
    gujarati: {
      regular: await doc.embedFont(gujaratiRegular, { subset: true }),
      bold: await doc.embedFont(gujaratiBold, { subset: true }),
    },
    latin: {
      regular: await doc.embedFont(latinRegular, { subset: true }),
      bold: await doc.embedFont(latinBold, { subset: true }),
    },
  };
  const fontFor = (script: Script, bold: boolean | undefined): PDFFont => (bold ? fonts[script].bold : fonts[script].regular);

  let page: PDFPage | null = null;
  const current = (): PDFPage => {
    if (!page) throw new Error('addPage() must be called before drawing.');
    return page;
  };

  return {
    pageWidth: A4_WIDTH,
    pageHeight: A4_HEIGHT,

    addPage() {
      page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    },

    measure(text, style) {
      let width = 0;
      for (const run of splitRuns(text)) width += fontFor(run.script, style.bold).widthOfTextAtSize(run.text, style.size);
      return width;
    },

    text(text, x, baselineY, style) {
      const target = current();
      const color = toColor(style.color ?? DEFAULT_TEXT_COLOR);
      let cursor = x;
      for (const run of splitRuns(text)) {
        const font = fontFor(run.script, style.bold);
        target.drawText(run.text, { x: cursor, y: A4_HEIGHT - baselineY, size: style.size, font, color });
        cursor += font.widthOfTextAtSize(run.text, style.size);
      }
    },

    rect(x, y, width, height, fill) {
      current().drawRectangle({ x, y: A4_HEIGHT - y - height, width, height, color: toColor(fill) });
    },

    line(x1, y1, x2, y2, color, width) {
      current().drawLine({
        start: { x: x1, y: A4_HEIGHT - y1 },
        end: { x: x2, y: A4_HEIGHT - y2 },
        thickness: width,
        color: toColor(color),
      });
    },

    path(points, fill) {
      if (points.length < 3) return;
      // pdf-lib reads an SVG path with y pointing DOWN from the origin (x, y) we give it: the top-left corner of the page.
      const d = points.map(([px, py], index) => (index === 0 ? 'M' : 'L') + px.toFixed(2) + ' ' + py.toFixed(2)).join(' ') + ' Z';
      current().drawSvgPath(d, { x: 0, y: A4_HEIGHT, color: toColor(fill), borderWidth: 0 });
    },

    async finish(meta) {
      doc.setTitle(meta.title);
      doc.setProducer('My Native Preparation');
      doc.setCreator('My Native Preparation');
      return doc.save();
    },
  };
}
