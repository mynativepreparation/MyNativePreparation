import { describe, expect, it } from 'vitest';
import { caretAt, docFromText, emptyDoc, lineText, toggleBullet, toggleMark, type DocSelection, type RichDoc } from '../../core/admin/richDoc';
import { applyInput, endOf, oneLine, reconcileText, stepBack, stepForward, type InputOutcome } from './richBoxModel';

// The pure part of the Admin text box: what a browser input event does to the doc (P10 T11m).

const texts = (doc: RichDoc): string[] => doc.map((line) => lineText(line));
const at = (line: number, offset: number): DocSelection => caretAt({ line, offset });
const span = (line: number, from: number, to: number): DocSelection => ({
  anchor: { line, offset: from },
  focus: { line, offset: to },
});
const bold = (doc: RichDoc, line: number, from: number, to: number): RichDoc => toggleMark(doc, span(line, from, to), 'bold');
const boldTexts = (doc: RichDoc): string[] => doc.flatMap((line) => line.runs.filter((run) => run.bold).map((run) => run.text));

function input(doc: RichDoc, selection: DocSelection, inputType: string, data: string | null = null, singleLine = false): InputOutcome {
  return applyInput(doc, selection, { inputType, data, singleLine });
}

function edited(outcome: InputOutcome): { doc: RichDoc; texts: string[]; selection: DocSelection } {
  if (outcome.kind !== 'edit') throw new Error(`expected an edit, got ${outcome.kind}`);
  return { doc: outcome.doc, texts: texts(outcome.doc), selection: outcome.selection };
}

/** 'abcd' split after 'ab': two lines. */
const twoLines = (): RichDoc => edited(input(docFromText('abcd'), at(0, 2), 'insertParagraph')).doc;

describe('typing and pasting', () => {
  it('inserts at the caret and puts the caret behind it', () => {
    const result = edited(input(docFromText('ab'), at(0, 1), 'insertText', 'X'));
    expect(result.texts).toEqual(['aXb']);
    expect(result.selection).toEqual(at(0, 2));
  });

  it('typed text takes the style of the text around it', () => {
    const result = edited(input(bold(docFromText('ab'), 0, 0, 2), at(0, 1), 'insertText', 'X'));
    expect(boldTexts(result.doc)).toEqual(['aXb']);
  });

  it('replaces a selection', () => {
    expect(edited(input(docFromText('abcd'), span(0, 1, 3), 'insertText', 'X')).texts).toEqual(['aXd']);
  });

  it('a pasted text with line breaks makes lines', () => {
    expect(edited(input(docFromText('ab'), at(0, 1), 'insertFromPaste', 'X\nY')).texts).toEqual(['aX', 'Yb']);
  });

  it('keeps marks and braces of the pasted text as plain letters', () => {
    const result = edited(input(docFromText('ab'), at(0, 1), 'insertFromPaste', '*x* {c=red|y}'));
    expect(result.texts).toEqual(['a*x* {c=red|y}b']);
    expect(boldTexts(result.doc)).toEqual([]);
  });

  it('single line: line breaks in the text become spaces', () => {
    expect(edited(input(docFromText('ab'), at(0, 1), 'insertFromPaste', 'X\nY', true)).texts).toEqual(['aX Yb']);
  });

  it('an empty insert at a caret does nothing', () => {
    expect(input(docFromText('ab'), at(0, 1), 'insertText', '').kind).toBe('ignore');
    expect(input(docFromText('ab'), at(0, 1), 'insertText', null).kind).toBe('ignore');
  });
});

describe('Enter', () => {
  it('splits the line at the caret', () => {
    const result = edited(input(docFromText('abcd'), at(0, 2), 'insertParagraph'));
    expect(result.texts).toEqual(['ab', 'cd']);
    expect(result.selection).toEqual(at(1, 0));
  });

  it('a line break (Shift+Enter) does the same', () => {
    expect(edited(input(docFromText('abcd'), at(0, 2), 'insertLineBreak')).texts).toEqual(['ab', 'cd']);
  });

  it('does nothing in a single line box', () => {
    expect(input(docFromText('abcd'), at(0, 2), 'insertParagraph', null, true).kind).toBe('ignore');
  });
});

describe('deleting', () => {
  it('Backspace removes the letter before the caret', () => {
    const result = edited(input(docFromText('abc'), at(0, 2), 'deleteContentBackward'));
    expect(result.texts).toEqual(['ac']);
    expect(result.selection).toEqual(at(0, 1));
  });

  it('Delete removes the letter after the caret', () => {
    expect(edited(input(docFromText('abc'), at(0, 1), 'deleteContentForward')).texts).toEqual(['ac']);
  });

  it('a selection is removed by either key', () => {
    expect(edited(input(docFromText('abc'), span(0, 0, 2), 'deleteContentBackward')).texts).toEqual(['c']);
    expect(edited(input(docFromText('abc'), span(0, 1, 3), 'deleteContentForward')).texts).toEqual(['a']);
  });

  it('Backspace at the start of a line joins it to the line above', () => {
    const result = edited(input(twoLines(), at(1, 0), 'deleteContentBackward'));
    expect(result.texts).toEqual(['abcd']);
    expect(result.selection).toEqual(at(0, 2));
  });

  it('Delete at the end of a line joins the next line', () => {
    expect(edited(input(twoLines(), at(0, 2), 'deleteContentForward')).texts).toEqual(['abcd']);
  });

  it('does nothing at the very start or the very end', () => {
    expect(input(docFromText('ab'), at(0, 0), 'deleteContentBackward').kind).toBe('ignore');
    expect(input(docFromText('ab'), at(0, 2), 'deleteContentForward').kind).toBe('ignore');
  });

  it('the first Backspace at the start of a bullet only removes the bullet', () => {
    const bullet = toggleBullet(docFromText('a'), at(0, 0));
    expect(bullet.map((line) => line.bullet)).toEqual([true]);
    const result = edited(input(bullet, at(0, 0), 'deleteContentBackward'));
    expect(result.doc.map((line) => line.bullet)).toEqual([false]);
    expect(result.texts).toEqual(['a']);
  });

  it('removes whole words', () => {
    expect(edited(input(docFromText('hello world'), at(0, 11), 'deleteWordBackward')).texts).toEqual(['hello ']);
    expect(edited(input(docFromText('hello world'), at(0, 0), 'deleteWordForward')).texts).toEqual([' world']);
  });

  it('removes up to the start or the end of the line', () => {
    expect(edited(input(docFromText('hello world'), at(0, 5), 'deleteSoftLineBackward')).texts).toEqual([' world']);
    expect(edited(input(docFromText('hello world'), at(0, 5), 'deleteSoftLineForward')).texts).toEqual(['hello']);
  });

  it('never cuts a letter outside the basic plane in half', () => {
    const doc = docFromText('\u{1F600}a');
    expect(edited(input(doc, at(0, 2), 'deleteContentBackward')).texts).toEqual(['a']);
    expect(edited(input(doc, at(0, 0), 'deleteContentForward')).texts).toEqual(['a']);
  });

  it('cut removes the selection', () => {
    expect(edited(input(docFromText('abc'), span(0, 1, 2), 'deleteByCut')).texts).toEqual(['ac']);
  });
});

describe('other input types', () => {
  it('undo and redo are handed back, not done here', () => {
    expect(input(docFromText('ab'), at(0, 0), 'historyUndo').kind).toBe('undo');
    expect(input(docFromText('ab'), at(0, 0), 'historyRedo').kind).toBe('redo');
  });

  it('Ctrl+B / I / U toggle the mark on the selection', () => {
    const result = edited(input(docFromText('ab'), span(0, 0, 2), 'formatBold'));
    expect(boldTexts(result.doc)).toEqual(['ab']);
    const italic = edited(input(docFromText('ab'), span(0, 0, 1), 'formatItalic'));
    expect(italic.doc.flatMap((line) => line.runs.filter((run) => run.italic).map((run) => run.text))).toEqual(['a']);
    const underline = edited(input(docFromText('ab'), span(0, 1, 2), 'formatUnderline'));
    expect(underline.doc.flatMap((line) => line.runs.filter((run) => run.underline).map((run) => run.text))).toEqual(['b']);
  });

  it('an input type it does not know is ignored', () => {
    expect(input(docFromText('ab'), at(0, 0), 'somethingNew', 'x').kind).toBe('ignore');
  });

  it('an empty doc is treated as one empty line', () => {
    expect(edited(input([], at(0, 0), 'insertText', 'a')).texts).toEqual(['a']);
  });
});

describe('small helpers', () => {
  it('oneLine, stepBack, stepForward and endOf', () => {
    expect(oneLine('a\r\nb\nc\rd')).toBe('a b c d');
    expect(stepBack('ab', 2)).toBe(1);
    expect(stepBack('ab', 0)).toBe(0);
    expect(stepBack('\u{1F600}', 2)).toBe(0);
    expect(stepForward('ab', 0)).toBe(1);
    expect(stepForward('ab', 2)).toBe(2);
    expect(stepForward('\u{1F600}', 0)).toBe(2);
    expect(endOf(twoLines())).toEqual(at(1, 2));
    expect(endOf(emptyDoc())).toEqual(at(0, 0));
    expect(endOf([])).toEqual(at(0, 0));
  });
});

describe('reconcileText (what the browser wrote during an IME composition)', () => {
  it('letters added at the end keep the style of the letters that did not change', () => {
    const doc = bold(docFromText('abc'), 0, 0, 1);
    const next = reconcileText(doc, ['abcX'], false);
    expect(texts(next)).toEqual(['abcX']);
    expect(boldTexts(next)).toEqual(['a']);
  });

  it('letters removed keep the style of the rest', () => {
    const doc = bold(docFromText('abc'), 0, 0, 1);
    const next = reconcileText(doc, ['ac'], false);
    expect(texts(next)).toEqual(['ac']);
    expect(boldTexts(next)).toEqual(['a']);
  });

  it('a replaced middle part is found by the common start and end', () => {
    expect(texts(reconcileText(docFromText('hello world'), ['hello brave world'], false))).toEqual(['hello brave world']);
  });

  it('gives the same doc back when nothing changed', () => {
    const doc = bold(docFromText('abc'), 0, 0, 1);
    expect(reconcileText(doc, ['abc'], false)).toEqual(doc);
  });

  it('changes one line of several and leaves the others alone', () => {
    expect(texts(reconcileText(twoLines(), ['ab', 'cdX'], false))).toEqual(['ab', 'cdX']);
  });

  it('a different number of lines keeps the text and drops the styles', () => {
    const next = reconcileText(twoLines(), ['x'], false);
    expect(texts(next)).toEqual(['x']);
    expect(next.map((line) => line.bullet)).toEqual([false]);
  });

  it('single line: several lines from the browser become one', () => {
    expect(texts(reconcileText(docFromText('ab'), ['a', 'b'], true))).toEqual(['a b']);
  });
});
