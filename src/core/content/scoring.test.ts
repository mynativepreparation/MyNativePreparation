import { describe, expect, it } from 'vitest';
import { effectiveQuestionCount, percentOf, starsForPercent } from './scoring';

describe('starsForPercent (DECISIONS Q6)', () => {
  it.each([
    [0, 1],
    [39, 1],
    [40, 2],
    [59, 2],
    [60, 3],
    [74, 3],
    [75, 4],
    [89, 4],
    [90, 5],
    [100, 5],
  ])('%i%% -> %i stars', (percent, stars) => {
    expect(starsForPercent(percent)).toBe(stars);
  });

  it('gives 1 star for values that are not numbers', () => {
    expect(starsForPercent(Number.NaN)).toBe(1);
    expect(starsForPercent(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('percentOf', () => {
  it.each([
    [0, 0, 0],
    [0, 5, 0],
    [3, 5, 60],
    [1, 3, 33],
    [2, 3, 67],
    [5, 5, 100],
    [7, 5, 100],
    [-2, 5, 0],
    [3, 0, 0],
    [3, -1, 0],
  ])('%i correct of %i asked -> %i%%', (correct, asked, expected) => {
    expect(percentOf(correct, asked)).toBe(expected);
  });

  it('returns 0 for values that are not numbers', () => {
    expect(percentOf(Number.NaN, 5)).toBe(0);
    expect(percentOf(3, Number.NaN)).toBe(0);
  });

  it('works together with stars at the rounding edges', () => {
    // 9 of 10 -> 90% -> 5 stars; 17 of 20 -> 85% -> 4 stars; 3 of 5 -> 60% -> 3 stars.
    expect(starsForPercent(percentOf(9, 10))).toBe(5);
    expect(starsForPercent(percentOf(17, 20))).toBe(4);
    expect(starsForPercent(percentOf(3, 5))).toBe(3);
    // 2 of 5 -> 40% -> 2 stars; 1 of 5 -> 20% -> 1 star.
    expect(starsForPercent(percentOf(2, 5))).toBe(2);
    expect(starsForPercent(percentOf(1, 5))).toBe(1);
  });
});

describe('effectiveQuestionCount', () => {
  it.each([
    [5, 6, 5],
    [50, 6, 6],
    [5, 5, 5],
    [5, 0, 0],
    [0, 6, 0],
    [-3, 6, 0],
    [5.9, 6, 5],
    [5, Number.NaN, 0],
  ])('per game %f with %f available -> %i', (perGame, available, expected) => {
    expect(effectiveQuestionCount(perGame, available)).toBe(expected);
  });
});
