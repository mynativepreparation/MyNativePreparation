import type { Question, Test } from '../content/types';
import { newQuestion, type DraftImage } from './model';
import { summarizeProblems, type Problem } from './problems';

// Small pure helpers for the test window (P10 T11t, DECISIONS Q27): one question at a time, "Add more question", and an Edit
// list with move / delete. No DOM, no storage. Every helper returns NEW arrays / objects; the inputs are never changed.

/** The option positions of a question (SPEC D4: exactly four). */
export type OptionIndex = 0 | 1 | 2 | 3;

/** A new, empty question for "Add more question": no text, four empty options, the first one marked correct. */
export function blankQuestion(): Question {
  return newQuestion('', ['', '', '', ''], 0);
}

/** True when nothing was typed yet (no text, no option, no explanation): an untouched placeholder. Spaces only count as empty. */
export function isBlankQuestion(question: Question): boolean {
  return (
    question.text.trim() === '' &&
    question.options.every((option) => option.trim() === '') &&
    (question.explanation ?? '').trim() === ''
  );
}

/** The questions to store: untouched placeholders are left out, so an extra "Add more question" never blocks Save. */
export function withoutBlankQuestions(questions: readonly Question[]): Question[] {
  return questions.filter((question) => !isBlankQuestion(question));
}

/** Moves the question at `index` one place up (-1) or down (+1). A move off either end gives the same order. */
export function moveQuestion(questions: readonly Question[], index: number, delta: -1 | 1): Question[] {
  const next = [...questions];
  const to = index + delta;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  const moved = next[index];
  const other = next[to];
  if (moved === undefined || other === undefined) return next;
  next[index] = other;
  next[to] = moved;
  return next;
}

/** The questions without the one that has this id (an unknown id changes nothing). */
export function removeQuestion(questions: readonly Question[], id: string): Question[] {
  return questions.filter((question) => question.id !== id);
}

/** The questions with the one that has `next.id` replaced (an unknown id changes nothing). */
export function replaceQuestion(questions: readonly Question[], next: Question): Question[] {
  return questions.map((question) => (question.id === next.id ? next : question));
}

export function withText(question: Question, text: string): Question {
  return { ...question, text };
}

/** Sets one of the four options. */
export function withOption(question: Question, index: OptionIndex, text: string): Question {
  const options: Question['options'] = [question.options[0], question.options[1], question.options[2], question.options[3]];
  options[index] = text;
  return { ...question, options };
}

/** Marks one of the four options as the correct one. */
export function withCorrect(question: Question, index: OptionIndex): Question {
  return { ...question, correctIndex: index };
}

/** Sets the explanation; an empty (or spaces-only) text removes it, like the rest of the editor does. */
export function withExplanation(question: Question, text: string): Question {
  const next: Question = {
    id: question.id,
    text: question.text,
    options: question.options,
    correctIndex: question.correctIndex,
  };
  if (text.trim() !== '') next.explanation = text;
  return next;
}

/**
 * The friendly problems of ONE test (an empty list = it can be saved), made by the same `summarizeProblems` the course window
 * uses. Only the test is judged: it is checked inside a valid stand-in course, so a missing course title or a bad block of the
 * course never shows up here.
 */
export function testProblems(test: Test, images: readonly DraftImage[], courseId: string): Problem[] {
  return summarizeProblems({
    course: { id: courseId, title: 'x', order: 1 },
    overview: [],
    content: [],
    tests: [test],
    images: [...images],
  });
}
