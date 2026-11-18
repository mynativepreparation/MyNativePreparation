import { describe, expect, it } from 'vitest';
import { boxesOverlap, findOverlappingPairs, runLayoutCheck } from './layoutCheck';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('overlap detection', () => {
  it('detects boxes that share an area', () => {
    expect(boxesOverlap(box(0, 0, 100, 50), box(90, 10, 200, 60))).toBe(true);
  });

  it('allows touching edges and small gaps', () => {
    expect(boxesOverlap(box(0, 0, 100, 50), box(100, 0, 200, 50))).toBe(false);
    expect(boxesOverlap(box(0, 0, 100, 50), box(0, 60, 100, 110))).toBe(false);
  });

  it('ignores a 1 px rounding overlap but not a bigger one', () => {
    expect(boxesOverlap(box(0, 0, 100, 50), box(99.5, 0, 200, 50))).toBe(false);
    expect(boxesOverlap(box(0, 0, 100, 50), box(95, 0, 200, 50))).toBe(true);
  });

  it('lists every overlapping pair once', () => {
    const boxes = [box(0, 0, 50, 50), box(40, 0, 90, 50), box(200, 0, 250, 50)];
    expect(findOverlappingPairs(boxes)).toEqual([[0, 1]]);
  });

  it('returns no pairs when nothing overlaps', () => {
    expect(findOverlappingPairs([box(0, 0, 10, 10), box(20, 0, 30, 10)])).toEqual([]);
  });
});

describe('runLayoutCheck', () => {
  it('reports no problems on an empty page', () => {
    expect(runLayoutCheck(document, window)).toEqual([]);
  });
});
