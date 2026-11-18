/** Whole-number percentage of correct answers. 0 when nothing was asked; always within 0..100. */
export function percentOf(correct: number, asked: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(asked) || asked <= 0) return 0;
  const p = Math.round((correct / asked) * 100);
  return Math.min(100, Math.max(0, p));
}

/** Star rating for a percentage (DECISIONS Q6): 90+ = 5, 75+ = 4, 60+ = 3, 40+ = 2, otherwise 1. */
export function starsForPercent(percent: number): 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(percent)) return 1;
  if (percent >= 90) return 5;
  if (percent >= 75) return 4;
  if (percent >= 60) return 3;
  if (percent >= 40) return 2;
  return 1;
}

/** How many questions a game really asks: the developer's number, but never more than the questions that exist. */
export function effectiveQuestionCount(questionsPerGame: number, available: number): number {
  if (!Number.isFinite(questionsPerGame) || !Number.isFinite(available)) return 0;
  return Math.max(0, Math.min(Math.floor(questionsPerGame), Math.floor(available)));
}
