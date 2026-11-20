// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { percentOf, starsForPercent } from '../../core/content/scoring';
import type { Question, Test } from '../../core/content/types';
import {
  answer,
  currentQuestion,
  next,
  result,
  scoreSoFar,
  startGame,
  type GameResult,
  type GameState,
  type Rng,
} from './engine';

/** Small deterministic random generator (mulberry32) so every test run is the same. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function question(i: number, withExplanation = false): Question {
  const q: Question = {
    id: `qst-${String(i).padStart(8, '0')}`,
    text: `Question ${i}?`,
    options: [`Q${i} option A`, `Q${i} option B`, `Q${i} option C`, `Q${i} option D`],
    correctIndex: (i % 4) as 0 | 1 | 2 | 3,
  };
  if (withExplanation) q.explanation = `Because of ${i}.`;
  return q;
}

function makeTest(poolSize: number, questionsPerGame: number, withExplanation = false): Test {
  return {
    id: 'tst-00000001',
    questionsPerGame,
    questions: Array.from({ length: poolSize }, (_, i) => question(i + 1, withExplanation)),
  };
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a value, got null');
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** Plays a whole game: the first `correctCount` questions are answered right, the rest wrong. */
function play(test: Test, correctCount: number, rng: Rng = seeded(1)): GameResult {
  let state = must(startGame(test, rng));
  for (let i = 0; i < state.questions.length; i++) {
    const q = currentQuestion(state);
    const pick = i < correctCount ? q.correctIndex : (q.correctIndex + 1) % 4;
    state = next(answer(state, pick));
  }
  return must(result(state));
}

describe('startGame: how many questions', () => {
  it('asks the developer number when it is smaller than the pool (a random subset, no repeats)', () => {
    const state = must(startGame(makeTest(8, 3), seeded(7)));
    expect(state.questions).toHaveLength(3);
    const ids = state.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(3);
    const pool = new Set(makeTest(8, 3).questions.map((q) => q.id));
    ids.forEach((id) => expect(pool.has(id)).toBe(true));
  });

  it('uses the whole pool in the developer order when the number equals the pool', () => {
    const state = must(startGame(makeTest(5, 5), seeded(3)));
    expect(state.questions.map((q) => q.id)).toEqual(makeTest(5, 5).questions.map((q) => q.id));
  });

  it('never asks more than exist', () => {
    const state = must(startGame(makeTest(5, 10), seeded(3)));
    expect(state.questions).toHaveLength(5);
  });

  it('returns null when there is nothing to ask', () => {
    expect(startGame(makeTest(5, 0))).toBeNull();
    expect(startGame(makeTest(5, -2))).toBeNull();
    expect(startGame(makeTest(5, Number.NaN))).toBeNull();
    expect(startGame(makeTest(0, 5))).toBeNull();
  });

  it('starts on the first question, waiting for an answer, with no answers yet', () => {
    const state = must(startGame(makeTest(4, 4), seeded(2)));
    expect(state).toMatchObject({ testId: 'tst-00000001', current: 0, status: 'asking', answers: [] });
  });

  it('gives different subsets for different seeds', () => {
    const firstIds = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      firstIds.add(must(startGame(makeTest(10, 3), seeded(seed))).questions[0].id);
    }
    expect(firstIds.size).toBeGreaterThan(1);
  });
});

describe('startGame: shuffled options', () => {
  it('keeps every option exactly once and tracks the right one, for many seeds', () => {
    const test = makeTest(6, 6);
    for (let seed = 1; seed <= 50; seed++) {
      const state = must(startGame(test, seeded(seed)));
      state.questions.forEach((shown, i) => {
        const original = test.questions[i];
        expect([...shown.options].sort()).toEqual([...original.options].sort());
        expect(shown.options[shown.correctIndex]).toBe(original.options[original.correctIndex]);
      });
    }
  });

  it('puts the right answer on every position (A-D) over many games', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      positions.add(must(startGame(makeTest(1, 1), seeded(seed))).questions[0].correctIndex);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is repeatable with the same seed', () => {
    expect(startGame(makeTest(9, 4), seeded(42))).toEqual(startGame(makeTest(9, 4), seeded(42)));
  });

  it('survives a random generator that returns exactly 1', () => {
    const test = makeTest(4, 2);
    const state = must(startGame(test, () => 1));
    expect(state.questions).toHaveLength(2);
    state.questions.forEach((q) => {
      const original = must(test.questions.find((x) => x.id === q.id) ?? null);
      expect([...q.options].sort()).toEqual([...original.options].sort());
    });
  });

  it('keeps the explanation only when the question has one', () => {
    const withText = must(startGame(makeTest(2, 2, true), seeded(1)));
    expect(withText.questions[0].explanation).toBe('Because of 1.');
    const without = must(startGame(makeTest(2, 2, false), seeded(1)));
    expect('explanation' in without.questions[0]).toBe(false);
  });

  it('does not change the test it was given', () => {
    const test = deepFreeze(makeTest(6, 3, true));
    const before = JSON.stringify(test);
    play(test, 2, seeded(9));
    expect(JSON.stringify(test)).toBe(before);
  });
});

describe('answer and next', () => {
  function fresh(): GameState {
    return must(startGame(makeTest(3, 3), seeded(5)));
  }

  it('marks a right answer correct and a wrong answer not correct', () => {
    const state = fresh();
    const right = currentQuestion(state).correctIndex;
    expect(answer(state, right).answers[0]).toMatchObject({ chosenIndex: right, correct: true });
    expect(answer(state, (right + 1) % 4).answers[0]).toMatchObject({ chosenIndex: (right + 1) % 4, correct: false });
  });

  it('moves to answered and records which question it was', () => {
    const state = fresh();
    const after = answer(state, 0);
    expect(after.status).toBe('answered');
    expect(after.answers[0].questionId).toBe(currentQuestion(state).id);
  });

  it('ignores a second answer to the same question (same state object back)', () => {
    const answered = answer(fresh(), 1);
    expect(answer(answered, 2)).toBe(answered);
    expect(answered.answers).toHaveLength(1);
  });

  it('ignores indexes that are not 0-3', () => {
    const state = fresh();
    for (const bad of [-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(answer(state, bad)).toBe(state);
    }
  });

  it('does not move on before the question is answered', () => {
    const state = fresh();
    expect(next(state)).toBe(state);
  });

  it('moves to the next question and asks again', () => {
    const state = next(answer(fresh(), 0));
    expect(state).toMatchObject({ current: 1, status: 'asking' });
  });

  it('finishes after the last question, and then ignores answer and next', () => {
    let state = fresh();
    for (let i = 0; i < 3; i++) state = next(answer(state, 0));
    expect(state.status).toBe('finished');
    expect(state.current).toBe(2);
    expect(answer(state, 0)).toBe(state);
    expect(next(state)).toBe(state);
  });

  it('stays on the last question until Next is pressed after the last answer', () => {
    let state = fresh();
    state = next(answer(state, 0));
    state = next(answer(state, 0));
    state = answer(state, 0);
    expect(state).toMatchObject({ current: 2, status: 'answered' });
  });

  it('never changes the previous state', () => {
    const state = deepFreeze(fresh());
    const snapshot = JSON.stringify(state);
    next(answer(state, 3));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('counts the score so far', () => {
    let state = fresh();
    expect(scoreSoFar(state)).toBe(0);
    state = next(answer(state, currentQuestion(state).correctIndex));
    expect(scoreSoFar(state)).toBe(1);
    state = next(answer(state, (currentQuestion(state).correctIndex + 1) % 4));
    expect(scoreSoFar(state)).toBe(1);
  });
});

describe('result', () => {
  it('is null until the game is finished', () => {
    const state = must(startGame(makeTest(2, 2), seeded(1)));
    expect(result(state)).toBeNull();
    expect(result(answer(state, 0))).toBeNull();
  });

  it('gives asked, correct, percent and stars', () => {
    expect(play(makeTest(4, 4), 4)).toMatchObject({ asked: 4, correct: 4, percent: 100, stars: 5 });
    expect(play(makeTest(4, 4), 3)).toMatchObject({ asked: 4, correct: 3, percent: 75, stars: 4 });
    expect(play(makeTest(4, 4), 0)).toMatchObject({ asked: 4, correct: 0, percent: 0, stars: 1 });
  });

  // Q6: 90+ = 5 stars, 75+ = 4, 60+ = 3, 40+ = 2, otherwise 1. A 100-question game makes correct = percent.
  it.each([
    [39, 1],
    [40, 2],
    [59, 2],
    [60, 3],
    [74, 3],
    [75, 4],
    [89, 4],
    [90, 5],
  ])('%i of 100 correct gives %i stars', (correct, stars) => {
    const outcome = play(makeTest(100, 100), correct);
    expect(outcome.percent).toBe(correct);
    expect(outcome.stars).toBe(stars);
  });

  it('uses the same numbers as scoring.ts (no second formula)', () => {
    for (const [pool, correct] of [[7, 5], [10, 7], [3, 2], [9, 1]]) {
      const outcome = play(makeTest(pool, pool), correct);
      expect(outcome.percent).toBe(percentOf(correct, pool));
      expect(outcome.stars).toBe(starsForPercent(outcome.percent));
    }
  });

  it('has one review item per question with what was chosen and what was right', () => {
    const test = makeTest(3, 3, true);
    let state = must(startGame(test, seeded(11)));
    const picks: number[] = [];
    for (let i = 0; i < 3; i++) {
      const q = currentQuestion(state);
      const pick = i === 1 ? (q.correctIndex + 2) % 4 : q.correctIndex;
      picks.push(pick);
      state = next(answer(state, pick));
    }
    const outcome = must(result(state));
    expect(outcome.review).toHaveLength(3);
    outcome.review.forEach((item, i) => {
      expect(item.questionId).toBe(state.questions[i].id);
      expect(item.chosenIndex).toBe(picks[i]);
      expect(item.correctIndex).toBe(state.questions[i].correctIndex);
      expect(item.correct).toBe(i !== 1);
      expect(item.explanation).toMatch(/^Because of /);
    });
    expect(outcome.correct).toBe(2);
  });
});
