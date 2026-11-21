import { describe, expect, it } from 'vitest';
import { CONTENT_BOTTOM_GAP, drawReport, PAGE_MARGIN, starPoints, type ReportLabels } from './layout';
import { palette } from './palette';
import { A4_HEIGHT, A4_WIDTH, type PdfSurface, type Point, type Rgb, type TextStyle } from './pdf/surface';
import { buildReportModel, type CourseReport, type ReportModel } from './reportData';

// The layout is tested on a FAKE surface that records every call. The real look is judged by the owner on the PC and the phone.
// Fake text width: 0.5 x size per code point (0.6 x size when bold).

interface TextCall {
  kind: 'text';
  page: number;
  text: string;
  x: number;
  y: number;
  style: TextStyle;
  width: number;
}
interface RectCall {
  kind: 'rect';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: Rgb;
}
interface PathCall {
  kind: 'path';
  page: number;
  points: readonly Point[];
  fill: Rgb;
}
type Call = { kind: 'page' } | { kind: 'line'; page: number } | TextCall | RectCall | PathCall;

function createFakeSurface() {
  const calls: Call[] = [];
  let page = 0;
  const widthOf = (text: string, style: TextStyle): number =>
    Array.from(text).length * style.size * (style.bold ? 0.6 : 0.5);
  const surface: PdfSurface = {
    pageWidth: A4_WIDTH,
    pageHeight: A4_HEIGHT,
    addPage() {
      page += 1;
      calls.push({ kind: 'page' });
    },
    measure: widthOf,
    text(text, x, y, style) {
      calls.push({ kind: 'text', page, text, x, y, style, width: widthOf(text, style) });
    },
    rect(x, y, width, height, fill) {
      calls.push({ kind: 'rect', page, x, y, width, height, fill });
    },
    line() {
      calls.push({ kind: 'line', page });
    },
    path(points, fill) {
      calls.push({ kind: 'path', page, points, fill });
    },
    finish: () => Promise.resolve(new Uint8Array()),
  };
  return { surface, calls };
}

const texts = (calls: Call[]): TextCall[] => calls.filter((call): call is TextCall => call.kind === 'text');
const rects = (calls: Call[]): RectCall[] => calls.filter((call): call is RectCall => call.kind === 'rect');
const paths = (calls: Call[]): PathCall[] => calls.filter((call): call is PathCall => call.kind === 'path');

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

const course = (id: string, over: Partial<CourseReport> = {}): CourseReport => ({
  id,
  title: `Course ${id}`,
  opened: true,
  testsTaken: 2,
  bestPercent: 90,
  lastPercent: 60,
  stars: 5,
  ...over,
});

const modelOf = (courses: CourseReport[], extra: Partial<ReportModel> = {}): ReportModel => ({
  totals: {
    coursesOpened: courses.filter((c) => c.opened).length,
    testsTaken: courses.reduce((sum, c) => sum + c.testsTaken, 0),
    stars: courses.reduce((sum, c) => sum + c.stars, 0),
  },
  courses,
  ...extra,
});

const manyCourses = (count: number): CourseReport[] => Array.from({ length: count }, (_, i) => course(`crs-${i}`));

const pagesFor = (count: number): number => drawReport(createFakeSurface().surface, modelOf(manyCourses(count)), labels).pages;

const EPS = 1e-6;
const cardRects = (calls: Call[]): RectCall[] => rects(calls).filter((r) => r.fill === palette.card);

describe('drawReport: basics', () => {
  it('an empty model draws nothing, not even a page', () => {
    const { surface, calls } = createFakeSurface();
    expect(drawReport(surface, modelOf([]), labels)).toEqual({ pages: 0 });
    expect(calls).toEqual([]);
  });

  it('starts with a page and never draws before it', () => {
    const { surface, calls } = createFakeSurface();
    expect(drawReport(surface, modelOf([course('a')]), labels)).toEqual({ pages: 1 });
    expect(calls[0]).toEqual({ kind: 'page' });
    for (const call of calls) if (call.kind !== 'page') expect((call as { page: number }).page).toBeGreaterThanOrEqual(1);
  });

  it('draws the title, the name and the date in the header band', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a')], { userName: 'આશા પટેલ' }), labels, { dateText: '21 Nov 2026' });
    const all = texts(calls);
    expect(all.find((t) => t.text === 'Progress report')).toMatchObject({ x: PAGE_MARGIN, style: { size: 26, bold: true } });
    expect(all.some((t) => t.text === 'આશા પટેલ')).toBe(true);
    expect(all.some((t) => t.text === '21 Nov 2026')).toBe(true);
    const band = rects(calls).find((r) => r.fill === palette.band && r.y === 0);
    expect(band).toMatchObject({ x: 0, width: A4_WIDTH });
  });

  it('shows the three totals with their labels', () => {
    const { surface, calls } = createFakeSurface();
    const model: ReportModel = { totals: { coursesOpened: 7, testsTaken: 12, stars: 20 }, courses: [course('a')] };
    drawReport(surface, model, labels);
    const all = texts(calls);
    expect(all.filter((t) => t.style.size === 24).map((t) => t.text)).toEqual(['7', '12', '20']);
    for (const label of [labels.coursesOpened, labels.testsTaken, labels.stars]) {
      expect(all.some((t) => t.text === label), label).toBe(true);
    }
  });

  it('does not change the model', () => {
    const model = modelOf(manyCourses(3), { userName: 'Asha' });
    const before = JSON.stringify(model);
    drawReport(createFakeSurface().surface, model, labels);
    expect(JSON.stringify(model)).toBe(before);
  });
});

describe('drawReport: pages', () => {
  it('the page count grows with the course count', () => {
    const counts = Array.from({ length: 40 }, (_, i) => pagesFor(i + 1));
    expect(counts[0]).toBe(1);
    expect(counts[3]).toBe(1);
    expect(counts[4]).toBe(2);
    expect(counts[39]).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1] ?? 0);
  });

  it('prints "page x of y" centred at the bottom of every page', () => {
    const { surface, calls } = createFakeSurface();
    const { pages } = drawReport(surface, modelOf(manyCourses(25)), labels);
    expect(pages).toBeGreaterThan(2);
    for (let page = 1; page <= pages; page += 1) {
      const footer = texts(calls).find((t) => t.page === page && t.text === `Page ${page} of ${pages}`);
      expect(footer, `page ${page}`).toBeDefined();
      expect((footer?.x ?? 0) + (footer?.width ?? 0) / 2).toBeCloseTo(A4_WIDTH / 2, 6);
      expect(footer?.y).toBeCloseTo(A4_HEIGHT - 26, 6);
    }
  });

  it('only the first page has the big header; later pages get a thin strip', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf(manyCourses(12)), labels);
    expect(texts(calls).filter((t) => t.text === 'Progress report').map((t) => t.page)).toEqual([1]);
    expect(rects(calls).some((r) => r.page === 2 && r.y === 0 && r.height < 20 && r.fill === palette.band)).toBe(true);
  });

  it('keeps the course order, and cards on a page never overlap', () => {
    const { surface, calls } = createFakeSurface();
    const courses = manyCourses(12);
    drawReport(surface, modelOf(courses), labels);
    const titles = texts(calls)
      .filter((t) => t.style.size === 14 && t.style.color === palette.text)
      .map((t) => t.text);
    expect(titles).toEqual(courses.map((c) => c.title));
    const cards = cardRects(calls);
    expect(cards).toHaveLength(12);
    for (let i = 1; i < cards.length; i += 1) {
      const previous = cards[i - 1];
      const next = cards[i];
      if (previous && next && previous.page === next.page) {
        expect(next.y).toBeGreaterThanOrEqual(previous.y + previous.height - EPS);
      }
    }
  });
});

describe('drawReport: nothing outside the margins', () => {
  it('texts, cards, tiles, bars and stars stay inside the margins; the page bottom is kept free', () => {
    const { surface, calls } = createFakeSurface();
    const long = 'ભારતીય બંધારણ અને રાજ્યવ્યવસ્થાનો પરિચય '.repeat(6);
    const courses = manyCourses(30).map((c, i) => (i % 3 === 0 ? { ...c, title: long } : c));
    drawReport(surface, modelOf(courses, { userName: 'આશા પટેલ '.repeat(30) }), labels, { dateText: '21 Nov 2026' });

    for (const t of texts(calls)) {
      expect(t.x, t.text).toBeGreaterThanOrEqual(PAGE_MARGIN - EPS);
      expect(t.x + t.width, t.text).toBeLessThanOrEqual(A4_WIDTH - PAGE_MARGIN + EPS);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(A4_HEIGHT);
    }
    for (const r of rects(calls)) {
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(A4_HEIGHT);
      const fullWidthBand = r.x === 0 && r.width === A4_WIDTH;
      if (!fullWidthBand) {
        expect(r.x).toBeGreaterThanOrEqual(PAGE_MARGIN - EPS);
        expect(r.x + r.width).toBeLessThanOrEqual(A4_WIDTH - PAGE_MARGIN + EPS);
      }
    }
    for (const p of paths(calls)) {
      for (const [x, y] of p.points) {
        expect(x).toBeGreaterThanOrEqual(PAGE_MARGIN);
        expect(x).toBeLessThanOrEqual(A4_WIDTH - PAGE_MARGIN);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(A4_HEIGHT);
      }
    }
    for (const card of cardRects(calls)) {
      expect(card.y + card.height).toBeLessThanOrEqual(A4_HEIGHT - CONTENT_BOTTOM_GAP + EPS);
    }
  });
});

describe('drawReport: long and Gujarati titles', () => {
  const firstCard = (calls: Call[]): RectCall => {
    const card = cardRects(calls)[0];
    if (!card) throw new Error('no card drawn');
    return card;
  };
  const titleLines = (calls: Call[]): TextCall[] =>
    texts(calls).filter((t) => t.style.size === 14 && t.style.color === palette.text);

  it('a long Gujarati title wraps into lines that stay inside the card and left of the stars', () => {
    const { surface, calls } = createFakeSurface();
    const title = 'ભારતીય બંધારણ '.repeat(4).trim();
    drawReport(surface, modelOf([course('a', { title })]), labels);
    const lines = titleLines(calls);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.map((l) => l.text).join(' ')).toBe(title);

    const starLeft = Math.min(...paths(calls).flatMap((p) => p.points.map((point) => point[0])));
    for (const line of lines) expect(line.x + line.width).toBeLessThanOrEqual(starLeft + EPS);

    const card = firstCard(calls);
    const baselines = texts(calls).filter((t) => t.y > card.y && t.y < card.y + card.height).map((t) => t.y);
    expect(Math.max(...baselines)).toBeLessThan(card.y + card.height - 4);
    // The card is taller than the one of a one-line title.
    const short = createFakeSurface();
    drawReport(short.surface, modelOf([course('a')]), labels);
    expect(card.height).toBeGreaterThan(firstCard(short.calls).height);
  });

  it('a long word without spaces is cut between clusters, never inside a conjunct', () => {
    const { surface, calls } = createFakeSurface();
    const title = 'ક્ષ'.repeat(30);
    drawReport(surface, modelOf([course('a', { title })]), labels);
    const lines = titleLines(calls).map((l) => l.text);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(title);
    for (const line of lines) {
      expect(line.endsWith('\u0ACD'), line).toBe(false);
      expect(/^\p{M}/u.test(line), line).toBe(false);
      expect(line).toBe('ક્ષ'.repeat(line.length / 3));
    }
  });

  it('a title that needs more than three lines ends with three dots', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a', { title: 'word '.repeat(100) })]), labels);
    const lines = titleLines(calls);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.text.endsWith('...')).toBe(true);
  });

  it('a long name in the header wraps to two lines at most', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a')], { userName: 'આશા પટેલ '.repeat(40) }), labels);
    const nameLines = texts(calls).filter((t) => t.style.size === 14 && t.style.color === palette.onBand);
    expect(nameLines.length).toBe(2);
    expect(nameLines[1]?.text.endsWith('...')).toBe(true);
  });
});

describe('drawReport: stars, bars and texts', () => {
  it('draws stars as paths: earned ones in the star colour, the others pale', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a', { stars: 3 })]), labels);
    const stars = paths(calls);
    expect(stars).toHaveLength(5);
    expect(stars.filter((s) => s.fill === palette.star)).toHaveLength(3);
    expect(stars.filter((s) => s.fill === palette.starOff)).toHaveLength(2);
    for (const star of stars) expect(star.points).toHaveLength(10);
    expect(texts(calls).some((t) => /[\u2605\u2606]/.test(t.text))).toBe(false);
  });

  it('draws the best and latest bars in proportion to the percent', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a', { bestPercent: 90, lastPercent: 0 })]), labels);
    const all = rects(calls);
    const tracks = all.filter((r) => r.fill === palette.track);
    const best = all.filter((r) => r.fill === palette.barBest);
    expect(tracks).toHaveLength(2);
    expect(best).toHaveLength(1);
    expect((best[0]?.width ?? 0) / (tracks[0]?.width ?? 1)).toBeCloseTo(0.9, 6);
    expect(all.filter((r) => r.fill === palette.barLast)).toHaveLength(0);
    const words = texts(calls).map((t) => t.text);
    expect(words).toEqual(expect.arrayContaining(['90%', '0%', labels.best, labels.last]));
  });

  it('a full bar is exactly as wide as its track', () => {
    const { surface, calls } = createFakeSurface();
    drawReport(surface, modelOf([course('a', { bestPercent: 100, lastPercent: 100 })]), labels);
    const track = rects(calls).find((r) => r.fill === palette.track);
    const last = rects(calls).find((r) => r.fill === palette.barLast);
    expect(last?.width).toBeCloseTo(track?.width ?? -1, 6);
  });

  it('a course without a test shows a note instead of bars and stars', () => {
    const { surface, calls } = createFakeSurface();
    const untested = course('a', { opened: true, testsTaken: 0, bestPercent: null, lastPercent: null, stars: 0 });
    drawReport(surface, modelOf([untested]), labels);
    expect(paths(calls)).toHaveLength(0);
    expect(rects(calls).some((r) => r.fill === palette.track)).toBe(false);
    const words = texts(calls).map((t) => t.text);
    expect(words).toContain(labels.noTest);
    expect(words).toContain(labels.opened);
  });

  it('the status line says opened or not and how many tests', () => {
    const { surface, calls } = createFakeSurface();
    const second = course('b', { opened: false, testsTaken: 1 });
    drawReport(surface, modelOf([course('a'), second]), labels);
    const words = texts(calls).map((t) => t.text);
    expect(words).toContain('Opened \u00B7 Tests taken: 2');
    expect(words).toContain('Not opened yet \u00B7 Tests taken: 1');
  });

  it('email and phone never appear on the page', () => {
    const { surface, calls } = createFakeSurface();
    const profile = { name: 'Asha', email: 'asha@example.com', phone: '9000000000' };
    const model = buildReportModel({
      courses: [{ id: 'crs-aaaaaaaa', title: 'Algebra', opened: true, attempts: [{ asked: 5, correct: 4, at: 1 }] }],
      profile,
    });
    drawReport(surface, model, labels, { dateText: '21 Nov 2026' });
    const everything = texts(calls).map((t) => t.text).join('\n');
    expect(everything).toContain('Asha');
    expect(everything).not.toContain('@');
    expect(everything).not.toContain('example.com');
    expect(everything).not.toContain('9000000000');
  });
});

describe('starPoints', () => {
  it('is a ten-point star with a tip pointing up', () => {
    const points = starPoints(100, 200, 10, 4);
    expect(points).toHaveLength(10);
    expect(points[0]?.[0]).toBeCloseTo(100, 6);
    expect(points[0]?.[1]).toBeCloseTo(190, 6);
    for (const [x, y] of points) expect(Math.hypot(x - 100, y - 200)).toBeLessThanOrEqual(10 + EPS);
  });
});
