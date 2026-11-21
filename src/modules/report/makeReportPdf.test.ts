import { describe, expect, it } from 'vitest';
import type { ReportLabels } from './layout';
import { makeReportPdf, type CreateSurface } from './makeReportPdf';
import { A4_HEIGHT, A4_WIDTH, type PdfSurface } from './pdf/surface';
import { buildReportModel } from './reportData';

// `makeReportPdf` is tested with a FAKE surface (the real pdf-lib surface has its own tests in pdf/). The real look is judged by the owner.

const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"

function createFakeSurface() {
  const state = { pages: 0, shapes: 0, texts: [] as string[], titles: [] as string[] };
  const surface: PdfSurface = {
    pageWidth: A4_WIDTH,
    pageHeight: A4_HEIGHT,
    addPage() {
      state.pages += 1;
    },
    measure: (text, style) => Array.from(text).length * style.size * 0.5,
    text(text) {
      state.texts.push(text);
    },
    rect() {
      state.shapes += 1;
    },
    line() {
      state.shapes += 1;
    },
    path() {
      state.shapes += 1;
    },
    finish(meta) {
      state.titles.push(meta.title);
      return Promise.resolve(PDF_BYTES);
    },
  };
  return { surface, state };
}

const labels: ReportLabels = {
  title: 'Progress report',
  coursesOpened: 'Courses opened',
  testsTaken: 'Tests taken',
  stars: 'Stars earned',
  opened: 'Opened',
  notOpened: 'Not opened yet',
  best: 'Best result',
  last: 'Latest result',
  noTest: 'No test taken yet',
  pageOf: (page, total) => `Page ${page} of ${total}`,
};

const model = buildReportModel({
  courses: [{ id: 'crs-aaaaaaaa', title: 'Algebra', opened: true, attempts: [{ asked: 5, correct: 4, at: 1 }] }],
});

describe('makeReportPdf', () => {
  it('draws the report and returns the bytes of the surface', async () => {
    const { surface, state } = createFakeSurface();
    const bytes = await makeReportPdf({ model, labels }, () => Promise.resolve(surface));
    expect(bytes).toBe(PDF_BYTES);
    expect(state.pages).toBeGreaterThanOrEqual(1);
    expect(state.shapes).toBeGreaterThan(0);
    expect(state.texts).toContain('Algebra');
  });

  it('sets the PDF title from the report title', async () => {
    const { surface, state } = createFakeSurface();
    await makeReportPdf({ model, labels }, () => Promise.resolve(surface));
    expect(state.titles).toEqual(['Progress report']);
  });

  it('puts the date text in the header when it is given', async () => {
    const { surface, state } = createFakeSurface();
    await makeReportPdf({ model, labels, dateText: '21 Nov 2026' }, () => Promise.resolve(surface));
    expect(state.texts).toContain('21 Nov 2026');
  });

  it('an empty model rejects and never creates a surface', async () => {
    let created = 0;
    const createSurface: CreateSurface = () => {
      created += 1;
      return Promise.resolve(createFakeSurface().surface);
    };
    await expect(makeReportPdf({ model: buildReportModel({ courses: [] }), labels }, createSurface)).rejects.toThrow(
      /empty/,
    );
    expect(created).toBe(0);
  });

  it('a surface that cannot be created rejects with its own error', async () => {
    const createSurface: CreateSurface = () => Promise.reject(new Error('Font file could not be loaded'));
    await expect(makeReportPdf({ model, labels }, createSurface)).rejects.toThrow('Font file could not be loaded');
  });
});
