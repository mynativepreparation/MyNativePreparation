import { effectiveQuestionCount, percentOf, starsForPercent } from '../../core/content/scoring';
import type { Question, Test } from '../../core/content/types';

// The quiz engine: pure logic, no React, no DOM, no sound (P07 plan). Every function returns a NEW state and never changes
// its input. Stars and percent come only from core/content/scoring.ts (DECISIONS Q6), never from a second formula here.

/** A random number in [0, 1). Tests pass a seeded one; the app uses Math.random. */
export type Rng = () => number;

/** A question as the game shows it: options already shuffled, `correctIndex` points into THIS order. */
export interface GameQuestion {
  id: string;
  text: string;
  options: readonly string[];
  correctIndex: number;
  explanation?: string;
}

export interface Answer {
  questionId: string;
  /** Position (0-3) of the option the person tapped, in the shuffled order. */
  chosenIndex: number;
  correct: boolean;
}

/**
 * `asking`: the question on screen waits for an answer. `answered`: it was answered, waiting for Next.
 * `finished`: the last question was answered and Next was pressed (the result is available).
 */
export type GameStatus = 'asking' | 'answered' | 'finished';

export interface GameState {
  testId: string;
  questions: readonly GameQuestion[];
  /** Index of the question on screen (stays on the last one when finished). */
  current: number;
  /** answers[i] belongs to questions[i]. */
  answers: readonly Answer[];
  status: GameStatus;
}

export interface ReviewItem {
  questionId: string;
  text: string;
  options: readonly string[];
  chosenIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation?: string;
}

export interface GameResult {
  asked: number;
  correct: number;
  percent: number;
  stars: 1 | 2 | 3 | 4 | 5;
  review: ReviewItem[];
}

/** Fisher-Yates on a copy. `rng` is clamped so a value of exactly 1 can never run past the end. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toGameQuestion(question: Question, rng: Rng): GameQuestion {
  const order = shuffled([0, 1, 2, 3], rng);
  const game: GameQuestion = {
    id: question.id,
    text: question.text,
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
  if (question.explanation !== undefined) game.explanation = question.explanation;
  return game;
}

/**
 * Starts a game. The length is `effectiveQuestionCount` (the developer's number, never more than exist).
 * When it is smaller than the pool the questions are a random subset in random order; when it uses the whole pool they keep
 * the developer's order. Options are shuffled for every question. Returns `null` when there is nothing to ask,
 * so the screen can show "not available" instead of an empty game.
 */
export function startGame(test: Test, rng: Rng = Math.random): GameState | null {
  const count = effectiveQuestionCount(test.questionsPerGame, test.questions.length);
  if (count < 1) return null;

  const picked = count < test.questions.length ? shuffled(test.questions, rng).slice(0, count) : test.questions;
  return {
    testId: test.id,
    questions: picked.map((question) => toGameQuestion(question, rng)),
    current: 0,
    answers: [],
    status: 'asking',
  };
}

/** The question on screen. */
export function currentQuestion(state: GameState): GameQuestion {
  return state.questions[state.current];
}

/** Records the tapped option. Ignored (same state back) when the question was already answered, the game is finished, or the index is not 0-3. */
export function answer(state: GameState, chosenIndex: number): GameState {
  if (state.status !== 'asking') return state;
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex > 3) return state;

  const question = currentQuestion(state);
  const entry: Answer = { questionId: question.id, chosenIndex, correct: chosenIndex === question.correctIndex };
  return { ...state, answers: [...state.answers, entry], status: 'answered' };
}

/** Moves to the next question, or to `finished` after the last one. Ignored (same state back) unless the question was answered. */
export function next(state: GameState): GameState {
  if (state.status !== 'answered') return state;
  if (state.current >= state.questions.length - 1) return { ...state, status: 'finished' };
  return { ...state, current: state.current + 1, status: 'asking' };
}

/** Correct answers so far (for the running scoreboard). */
export function scoreSoFar(state: GameState): number {
  return state.answers.filter((a) => a.correct).length;
}

/** The final numbers and the per-question review, or `null` while the game is not finished. */
export function result(state: GameState): GameResult | null {
  if (state.status !== 'finished') return null;

  const asked = state.questions.length;
  const correct = scoreSoFar(state);
  const percent = percentOf(correct, asked);
  const review: ReviewItem[] = state.questions.map((question, i) => {
    const given = state.answers[i];
    const item: ReviewItem = {
      questionId: question.id,
      text: question.text,
      options: question.options,
      chosenIndex: given.chosenIndex,
      correctIndex: question.correctIndex,
      correct: given.correct,
    };
    if (question.explanation !== undefined) item.explanation = question.explanation;
    return item;
  });
  return { asked, correct, percent, stars: starsForPercent(percent), review };
}
