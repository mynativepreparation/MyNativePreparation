import { palette } from './palette';
import type { PdfSurface, Point, Rgb, TextStyle } from './pdf/surface';
import { isReportEmpty, type CourseReport, type ReportModel } from './reportData';
import { wrapText } from './wrapText';

// Report layout (P08 T5): turns a `ReportModel` into drawing calls on a `PdfSurface`. Pure: no library, no i18n, no React.
// All texts come in through `labels` (the screen fills them from `t()`); titles and the user's name are drawn as given.
// Units are PDF points, origin top-left (see pdf/surface.ts). Stars are drawn as paths (the fonts have no star glyph).
// Every long text is wrapped by `measure`, a Gujarati word is cut only between clusters (wrapText.ts).

export interface ReportLabels {
  /** Header title, e.g. "Progress report". */
  title: string;
  coursesOpened: string;
  testsTaken: string;
  stars: string;
  opened: string;
  notOpened: string;
  /** Row label of the best result bar. */
  best: string;
  /** Row label of the latest result bar. */
  last: string;
  noTest: string;
  pageOf: (page: number, total: number) => string;
}

export interface DrawOptions {
  /** Already formatted date shown in the header (the layout formats nothing). */
  dateText?: string;
}

/** Left and right (and top) margin of the content, in points. */
export const PAGE_MARGIN = 40;
/** Content never goes lower than this distance above the page bottom; the page number lives below it. */
export const CONTENT_BOTTOM_GAP = 56;

const HEADER_TITLE_BASELINE = 48;
const HEADER_MIN_HEIGHT = 80;
const STRIPE_HEIGHT = 4;
const CONTINUATION_STRIP_HEIGHT = 8;
const CONTINUATION_TOP = 30;
const TOTALS_GAP_ABOVE = 20;
const TOTALS_HEIGHT = 64;
const TOTALS_GAP_BELOW = 18;
const TILE_GAP = 10;
const TILE_PAD = 10;
const FOOTER_FROM_BOTTOM = 26;

const CARD_PAD = 14;
const CARD_STRIPE = 5;
const CARD_GAP = 12;
const TITLE_LINE = 19;
const TITLE_MAX_LINES = 3;
const STATUS_LINE = 14;
const BAR_ROW = 22;
const BAR_HEIGHT = 8;
const LABEL_WIDTH = 110;
const PERCENT_WIDTH = 40;
const STAR_STEP = 16;
const STAR_OUTER = 7.5;
const STAR_INNER = 3.2;
const STARS_WIDTH = 5 * STAR_STEP;

const HEADER_TITLE: TextStyle = { size: 26, bold: true, color: palette.onBand };
const HEADER_NAME: TextStyle = { size: 14, bold: true, color: palette.onBand };
const HEADER_DATE: TextStyle = { size: 11, color: palette.onBandSoft };
const TILE_NUMBER: TextStyle = { size: 24, bold: true, color: palette.band };
const TILE_LABEL: TextStyle = { size: 10, color: palette.textMuted };
const CARD_TITLE: TextStyle = { size: 14, bold: true, color: palette.text };
const CARD_TEXT: TextStyle = { size: 10.5, color: palette.textMuted };
const ROW_LABEL: TextStyle = { size: 10.5, color: palette.text };
const ROW_PERCENT: TextStyle = { size: 10.5, bold: true, color: palette.text };
const FOOTER: TextStyle = { size: 10, color: palette.textMuted };

const measureWith =
  (surface: PdfSurface, style: TextStyle) =>
  (text: string): number =>
    surface.measure(text, style);

/** One line that is never wider than `maxWidth`: too long text ends with "...". */
function oneLine(surface: PdfSurface, text: string, style: TextStyle, maxWidth: number): string {
  return wrapText(text, maxWidth, measureWith(surface, style), 1)[0] ?? '';
}

/** Five-pointed star as a closed polygon (10 points), tip up. */
export function starPoints(centerX: number, centerY: number, outer: number, inner: number): Point[] {
  return Array.from({ length: 10 }, (_, index): Point => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)];
  });
}

// ---------- header and totals (first page) ----------

interface HeaderRow {
  text: string;
  style: TextStyle;
  baseline: number;
}

interface HeaderPlan {
  title: string;
  rows: HeaderRow[];
  height: number;
}

function planHeader(
  surface: PdfSurface,
  model: ReportModel,
  labels: ReportLabels,
  dateText: string | undefined,
): HeaderPlan {
  const width = surface.pageWidth - 2 * PAGE_MARGIN;
  const rows: HeaderRow[] = [];
  let baseline = HEADER_TITLE_BASELINE;
  const nameLines =
    model.userName === undefined ? [] : wrapText(model.userName, width, measureWith(surface, HEADER_NAME), 2);
  nameLines.forEach((text, index) => {
    baseline += index === 0 ? 24 : 18;
    rows.push({ text, style: HEADER_NAME, baseline });
  });
  if (dateText) {
    baseline += rows.length === 0 ? 22 : 17;
    rows.push({ text: oneLine(surface, dateText, HEADER_DATE, width), style: HEADER_DATE, baseline });
  }
  return {
    title: oneLine(surface, labels.title, HEADER_TITLE, width),
    rows,
    height: Math.max(HEADER_MIN_HEIGHT, baseline + 22),
  };
}

function drawHeader(surface: PdfSurface, header: HeaderPlan): void {
  surface.rect(0, 0, surface.pageWidth, header.height, palette.band);
  surface.rect(0, header.height, surface.pageWidth, STRIPE_HEIGHT, palette.stripe);
  surface.text(header.title, PAGE_MARGIN, HEADER_TITLE_BASELINE, HEADER_TITLE);
  for (const row of header.rows) surface.text(row.text, PAGE_MARGIN, row.baseline, row.style);
}

function drawTotals(surface: PdfSurface, model: ReportModel, labels: ReportLabels, top: number): void {
  const tileWidth = (surface.pageWidth - 2 * PAGE_MARGIN - 2 * TILE_GAP) / 3;
  const tiles = [
    { value: model.totals.coursesOpened, label: labels.coursesOpened },
    { value: model.totals.testsTaken, label: labels.testsTaken },
    { value: model.totals.stars, label: labels.stars },
  ];
  tiles.forEach((tile, index) => {
    const x = PAGE_MARGIN + index * (tileWidth + TILE_GAP);
    surface.rect(x, top, tileWidth, TOTALS_HEIGHT, palette.tile);
    surface.text(String(tile.value), x + TILE_PAD, top + 30, TILE_NUMBER);
    wrapText(tile.label, tileWidth - 2 * TILE_PAD, measureWith(surface, TILE_LABEL), 2).forEach((line, lineIndex) => {
      surface.text(line, x + TILE_PAD, top + 46 + lineIndex * 12, TILE_LABEL);
    });
  });
}

// ---------- course cards ----------

interface CardPlan {
  course: CourseReport;
  titleLines: string[];
  statusLines: string[];
  height: number;
}

const cardWidth = (surface: PdfSurface): number => surface.pageWidth - 2 * PAGE_MARGIN;
const cardInnerWidth = (surface: PdfSurface): number => cardWidth(surface) - CARD_STRIPE - 2 * CARD_PAD;

function planCard(surface: PdfSurface, course: CourseReport, labels: ReportLabels): CardPlan {
  const inner = cardInnerWidth(surface);
  const titleLines = wrapText(
    course.title,
    inner - STARS_WIDTH - 10,
    measureWith(surface, CARD_TITLE),
    TITLE_MAX_LINES,
  );
  const state = course.opened ? labels.opened : labels.notOpened;
  const status = course.testsTaken > 0 ? `${state} \u00B7 ${labels.testsTaken}: ${course.testsTaken}` : state;
  const statusLines = wrapText(status, inner, measureWith(surface, CARD_TEXT), 2);
  const rows = course.testsTaken > 0 ? 6 + 2 * BAR_ROW : 4 + STATUS_LINE;
  const height =
    CARD_PAD +
    Math.max(1, titleLines.length) * TITLE_LINE +
    4 +
    Math.max(1, statusLines.length) * STATUS_LINE +
    rows +
    CARD_PAD;
  return { course, titleLines, statusLines, height };
}

function drawStars(surface: PdfSurface, earned: number, right: number, centerY: number): void {
  for (let index = 0; index < 5; index += 1) {
    const centerX = right - STARS_WIDTH + STAR_STEP / 2 + index * STAR_STEP;
    surface.path(
      starPoints(centerX, centerY, STAR_OUTER, STAR_INNER),
      index < earned ? palette.star : palette.starOff,
    );
  }
}

function drawBarRow(
  surface: PdfSurface,
  label: string,
  percent: number,
  fill: Rgb,
  rowTop: number,
  textX: number,
  right: number,
): void {
  const baseline = rowTop + 11;
  surface.text(oneLine(surface, label, ROW_LABEL, LABEL_WIDTH), textX, baseline, ROW_LABEL);
  const trackX = textX + LABEL_WIDTH + 8;
  const trackWidth = right - PERCENT_WIDTH - trackX;
  surface.rect(trackX, rowTop + 3, trackWidth, BAR_HEIGHT, palette.track);
  if (percent > 0) surface.rect(trackX, rowTop + 3, (trackWidth * Math.min(100, percent)) / 100, BAR_HEIGHT, fill);
  const percentText = `${percent}%`;
  surface.text(percentText, right - surface.measure(percentText, ROW_PERCENT), baseline, ROW_PERCENT);
}

function drawCard(surface: PdfSurface, plan: CardPlan, top: number, labels: ReportLabels): void {
  const { course } = plan;
  const textX = PAGE_MARGIN + CARD_STRIPE + CARD_PAD;
  const right = PAGE_MARGIN + cardWidth(surface) - CARD_PAD;
  surface.rect(PAGE_MARGIN, top, cardWidth(surface), plan.height, palette.card);
  surface.rect(PAGE_MARGIN, top, CARD_STRIPE, plan.height, palette.band);

  const firstBaseline = top + CARD_PAD + 13;
  plan.titleLines.forEach((line, index) => surface.text(line, textX, firstBaseline + index * TITLE_LINE, CARD_TITLE));

  let y = top + CARD_PAD + Math.max(1, plan.titleLines.length) * TITLE_LINE + 4;
  plan.statusLines.forEach((line, index) => surface.text(line, textX, y + 10 + index * STATUS_LINE, CARD_TEXT));
  y += Math.max(1, plan.statusLines.length) * STATUS_LINE;

  if (course.testsTaken > 0) {
    drawStars(surface, course.stars, right, top + CARD_PAD + 8);
    drawBarRow(surface, labels.best, course.bestPercent ?? 0, palette.barBest, y + 6, textX, right);
    drawBarRow(surface, labels.last, course.lastPercent ?? 0, palette.barLast, y + 6 + BAR_ROW, textX, right);
  } else {
    const text = oneLine(surface, labels.noTest, CARD_TEXT, cardInnerWidth(surface));
    surface.text(text, textX, y + 4 + 10, CARD_TEXT);
  }
}

// ---------- pages ----------

interface Placement {
  plan: CardPlan;
  top: number;
}

/**
 * Draws the whole report. Returns the number of pages; an empty model draws nothing (no page) and returns 0.
 * Page 1 has the header band and the totals, later pages a thin strip; every page has "page x of y" at the bottom.
 */
export function drawReport(
  surface: PdfSurface,
  model: ReportModel,
  labels: ReportLabels,
  options: DrawOptions = {},
): { pages: number } {
  if (isReportEmpty(model)) return { pages: 0 };

  const header = planHeader(surface, model, labels, options.dateText);
  const plans = model.courses.map((course) => planCard(surface, course, labels));
  const totalsTop = header.height + STRIPE_HEIGHT + TOTALS_GAP_ABOVE;
  const limit = surface.pageHeight - CONTENT_BOTTOM_GAP;

  // Pass 1: decide which card goes on which page (a card is never split). Needed to print "page x of y".
  let current: Placement[] = [];
  const pages: Placement[][] = [current];
  let y = totalsTop + TOTALS_HEIGHT + TOTALS_GAP_BELOW;
  for (const plan of plans) {
    if (y + plan.height > limit && current.length > 0) {
      current = [];
      pages.push(current);
      y = CONTINUATION_TOP;
    }
    current.push({ plan, top: y });
    y += plan.height + CARD_GAP;
  }

  // Pass 2: draw.
  pages.forEach((placements, index) => {
    surface.addPage();
    if (index === 0) {
      drawHeader(surface, header);
      drawTotals(surface, model, labels, totalsTop);
    } else {
      surface.rect(0, 0, surface.pageWidth, CONTINUATION_STRIP_HEIGHT, palette.band);
    }
    for (const { plan, top } of placements) drawCard(surface, plan, top, labels);

    const footerWidth = surface.pageWidth - 2 * PAGE_MARGIN;
    const pageText = oneLine(surface, labels.pageOf(index + 1, pages.length), FOOTER, footerWidth);
    const footerX = (surface.pageWidth - surface.measure(pageText, FOOTER)) / 2;
    surface.text(pageText, footerX, surface.pageHeight - FOOTER_FROM_BOTTOM, FOOTER);
  });
  return { pages: pages.length };
}
