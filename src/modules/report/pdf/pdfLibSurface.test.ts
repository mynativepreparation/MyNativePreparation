// @vitest-environment node
// Runs the REAL pdf-lib + fontkit + the real WOFF files from public/fonts (no mocks), so a library or font change that breaks
// Gujarati shaping, subsetting or the GPOS guard fails here. How the result LOOKS is judged by the owner on PC and phone.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { isGposGuardInstalled } from './gposGuard';
import { createPdfLibSurface, FONT_FILES, pickFontkit, type FontLoader } from './pdfLibSurface';
import type { PdfSurface } from './surface';
import { A4_HEIGHT, A4_WIDTH } from './surface';

const fontPath = (fileName: string) => resolve(process.cwd(), 'public', 'fonts', fileName);
const loadFromDisk: FontLoader = async (fileName) => new Uint8Array(readFileSync(fontPath(fileName)));
const SLOW = 30_000;

describe('font files', () => {
  it('all four WOFF files the adapter needs exist in public/fonts', () => {
    const names = [
      FONT_FILES.gujarati.regular,
      FONT_FILES.gujarati.bold,
      FONT_FILES.latin.regular,
      FONT_FILES.latin.bold,
    ];
    for (const name of names) expect(existsSync(fontPath(name)), name).toBe(true);
  });
});

describe('pickFontkit', () => {
  const create = () => ({});
  it('finds create() on the module, on .default and on .default.default', () => {
    expect(pickFontkit({ create }).create).toBe(create);
    expect(pickFontkit({ default: { create } }).create).toBe(create);
    expect(pickFontkit({ default: { default: { create } } }).create).toBe(create);
  });

  it('throws a clear error when there is no create()', () => {
    expect(() => pickFontkit({})).toThrow('create()');
    expect(() => pickFontkit(null)).toThrow('create()');
  });
});

describe('createPdfLibSurface', () => {
  let surface: PdfSurface;

  beforeAll(async () => {
    surface = await createPdfLibSurface(loadFromDisk);
  }, SLOW);

  it('installs the GPOS guard', () => {
    expect(isGposGuardInstalled()).toBe(true);
  });

  it('reports the A4 page size', () => {
    expect(surface.pageWidth).toBe(A4_WIDTH);
    expect(surface.pageHeight).toBe(A4_HEIGHT);
  });

  it('measures Gujarati and Latin text, bold wider or equal, size linear, empty string zero', () => {
    expect(surface.measure('', { size: 12 })).toBe(0);
    const regular = surface.measure('ગુજરાતી', { size: 10 });
    expect(regular).toBeGreaterThan(0);
    expect(surface.measure('ગુજરાતી', { size: 10, bold: true })).toBeGreaterThanOrEqual(regular);
    expect(surface.measure('ગુજરાતી', { size: 20 })).toBeCloseTo(regular * 2, 3);
    expect(surface.measure('Std 10 ગણિત - Test 1: પરિણામ 8/10 (80%)', { size: 10 })).toBeGreaterThan(regular);
  });

  it('refuses to draw before the first page exists', () => {
    expect(() => surface.text('x', 0, 0, { size: 10 })).toThrow('addPage');
    expect(() => surface.rect(0, 0, 1, 1, [0, 0, 0])).toThrow('addPage');
  });

  it(
    'writes a real 2-page PDF with the hard Gujarati text, shapes without error and embeds only the used glyphs',
    { timeout: SLOW },
    async () => {
      const own = await createPdfLibSurface(loadFromDisk);
      own.addPage();
      own.rect(0, 0, A4_WIDTH, 80, [0.35, 0.4, 0.9]);
      own.text('ક્ષ જ્ઞ ત્ર શ્ર દ્ય દ્વ ક્ર ત્ત ન્ન શ્ચ ધ્ય', 40, 120, { size: 14 });
      own.text('કર્મ સર્વ ગર્વ ધર્મ વિદ્યાર્થી શિક્ષક પરીક્ષા અભ્યાસક્રમ', 40, 150, { size: 14, bold: true });
      own.text('કા કિ કી કુ કૂ કૃ કે કૈ કો કૌ અં અઃ અઁ ૧૨૩૪૫૬૭૮૯૦', 40, 180, { size: 14, color: [0.2, 0.2, 0.2] });
      own.text('Std 10 ગણિત - Test 1: પરિણામ 8/10 (80%)', 40, 210, { size: 12 });
      own.line(40, 230, 300, 230, [0.5, 0.5, 0.5], 1);
      own.path(
        [
          [100, 260],
          [110, 285],
          [135, 285],
          [115, 300],
          [123, 325],
          [100, 310],
          [77, 325],
          [85, 300],
          [65, 285],
          [90, 285],
        ],
        [1, 0.8, 0.1],
      );
      own.path(
        [
          [1, 1],
          [2, 2],
        ],
        [0, 0, 0],
      ); // fewer than 3 points: ignored, no error
      own.addPage();
      own.text('મારી નેટિવ પ્રિપેરેશન એપ્લિકેશન', 40, 60, { size: 12 });

      const bytes = await own.finish({ title: 'અહેવાલ Report' });
      expect(new TextDecoder('latin1').decode(bytes.subarray(0, 5))).toBe('%PDF-');

      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(2);
      expect(loaded.getTitle()).toBe('અહેવાલ Report');
      const size = loaded.getPage(0).getSize();
      expect(size.width).toBeCloseTo(A4_WIDTH, 1);
      expect(size.height).toBeCloseTo(A4_HEIGHT, 1);
      // the spike's one-page test PDF was 23 KB; unsubsetted fonts would be several times larger
      expect(bytes.length).toBeLessThan(150_000);
    },
  );

  it('passes a font loading error through', async () => {
    await expect(
      createPdfLibSurface(async () => {
        throw new Error('font boom');
      }),
    ).rejects.toThrow('font boom');
  });
});
