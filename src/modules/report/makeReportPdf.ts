import { drawReport, type ReportLabels } from './layout';
import type { PdfSurface } from './pdf/surface';
import { isReportEmpty, type ReportModel } from './reportData';

// Makes the report PDF bytes from a `ReportModel` (P08 T7a). No React. The heavy PDF library (pdf-lib + fontkit + the font files)
// is loaded with `import()` only when the person taps Create PDF, so the first screen stays light (budget: DECISIONS Q22).
// Loading the fonts is asynchronous, so the browser repaints the busy state before the (synchronous) drawing starts.

/** Creates the drawing surface; tests pass a fake one, the app uses the pdf-lib surface. */
export type CreateSurface = () => Promise<PdfSurface>;

const createPdfLibSurface: CreateSurface = async () => {
  const adapter = await import('./pdf/pdfLibSurface');
  return adapter.createPdfLibSurface();
};

export interface MakeReportPdfInput {
  model: ReportModel;
  labels: ReportLabels;
  /** Already formatted date for the header (the layout formats nothing). */
  dateText?: string;
}

/**
 * Draws the report and returns the PDF bytes. An empty model REJECTS (there is nothing to draw: the screen shows its empty state
 * and offers no PDF button); a failing surface (for example a font file that cannot be loaded) rejects with its own error.
 */
export async function makeReportPdf(
  input: MakeReportPdfInput,
  createSurface: CreateSurface = createPdfLibSurface,
): Promise<Uint8Array> {
  if (isReportEmpty(input.model)) throw new Error('The report is empty: there is nothing to draw.');
  const surface = await createSurface();
  drawReport(surface, input.model, input.labels, input.dateText === undefined ? {} : { dateText: input.dateText });
  return surface.finish({ title: input.labels.title });
}
