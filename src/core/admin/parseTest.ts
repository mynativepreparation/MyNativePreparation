import type { Question } from '../content/types';
import { newQuestion } from './model';

// Text -> test questions (SPEC D4, P10 T3). Pure function: no DOM, no network, no storage.
//
// Accepted shape (blank lines are ignored):
//   1. Question text            <- a line starting with a number or "Q" (Q1. / Q) / Question 2: / 3) ...)
//   A) first option             <- exactly 4 option lines follow; the labels A) B) C) D) are optional
//   B) **the correct option**   <- the BOLD one (`**text**`) is the correct answer
//   C) third option
//   D) fourth option
// A marker needs a separator (. ) : or -) and then a space, so "5.5 kg" or "5-10 years" stay option text.
// A bad question is reported with its line number and skipped; the other questions are still returned.
// Messages are codes: the UI maps them to strings in en.json.

export type TestParseCode =
  | 'text_before_first_question'
  | 'empty_question'
  | 'wrong_option_count'
  | 'empty_option'
  | 'no_bold_option'
  | 'multiple_bold_options';

export interface TestParseError {
  /** 1-based line of the question (or of the empty option / the stray text). */
  line: number;
  code: TestParseCode;
  /** For wrong_option_count: how many option lines were found. */
  found?: number;
}

export interface TestParseResult {
  questions: Question[];
  errors: TestParseError[];
}

const QUESTION_MARKER = /^(?:Q(?:uestion)?\s*\d*|\d+)\s*[.):-](?:\s+|$)/i;
const OPTION_LABEL = /^\(?[A-Da-d][.):](?:\s+|$)/;

interface RawOption {
  line: number;
  raw: string;
}

interface Group {
  line: number;
  text: string;
  options: RawOption[];
}

interface ParsedOption {
  text: string;
  bold: boolean;
}

function parseOption(raw: string): ParsedOption {
  let s = raw.trim().replace(OPTION_LABEL, '');
  let bold = false;
  if (s.length >= 4 && s.startsWith('**') && s.endsWith('**')) {
    const inner = s.slice(2, -2);
    if (!inner.includes('**')) {
      bold = true;
      s = inner.trim().replace(OPTION_LABEL, '');
    }
  }
  return { text: s.trim(), bold };
}

export function parseTestText(input: string): TestParseResult {
  const questions: Question[] = [];
  const errors: TestParseError[] = [];
  const groups: Group[] = [];
  let current: Group | null = null;
  let reportedStray = false;

  const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  for (const [i, rawLine] of lines.entries()) {
    const line = i + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '') continue;
    if (QUESTION_MARKER.test(trimmed)) {
      current = { line, text: trimmed.replace(QUESTION_MARKER, '').trim(), options: [] };
      groups.push(current);
    } else if (current === null) {
      if (!reportedStray) {
        errors.push({ line, code: 'text_before_first_question' });
        reportedStray = true;
      }
    } else {
      current.options.push({ line, raw: trimmed });
    }
  }

  for (const group of groups) {
    if (group.text === '') {
      errors.push({ line: group.line, code: 'empty_question' });
      continue;
    }
    if (group.options.length !== 4) {
      errors.push({ line: group.line, code: 'wrong_option_count', found: group.options.length });
      continue;
    }
    const parsed = group.options.map((o) => ({ line: o.line, ...parseOption(o.raw) }));
    const emptyOption = parsed.find((o) => o.text === '');
    if (emptyOption !== undefined) {
      errors.push({ line: emptyOption.line, code: 'empty_option' });
      continue;
    }
    let boldCount = 0;
    let correct = -1;
    for (const [index, o] of parsed.entries()) {
      if (o.bold) {
        boldCount += 1;
        correct = index;
      }
    }
    if (boldCount === 0) {
      errors.push({ line: group.line, code: 'no_bold_option' });
      continue;
    }
    if (boldCount > 1) {
      errors.push({ line: group.line, code: 'multiple_bold_options' });
      continue;
    }
    const options = parsed.map((o) => o.text) as Question['options'];
    questions.push(newQuestion(group.text, options, correct as 0 | 1 | 2 | 3));
  }

  errors.sort((a, b) => a.line - b.line);
  return { questions, errors };
}
