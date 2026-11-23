// @vitest-environment node
// T11l: the pure editor engine, part 2: changing the style, bullets and boxes, typing, pasting, deleting, Enter, and what the toolbar asks
// (mark state, colour, font, box, size). Part 1 (writing the stored text, reading it back, positions) is richDoc.test.ts.
import { describe, expect, it } from 'vitest';
import type { Run } from '../content/inline';
import {
  applyStyle,
  boxOf,
  caretAt,
  clearStyle,
  colorOf,
  docFromText,
  docToText,
  emptyDoc,
  enter,
  flatText,
  fontOf,
  isCollapsed,
  lineLength,
  markState,
  PLAIN_STYLE,
  replaceRange,
  setLineBox,
  sizeOf,
  styleAt,
  toggleBullet,
  toggleMark,
  type DocLine,
  type DocSelection,
  type RichDoc,
} from './richDoc';

function run(text: string, extra: Partial<Run> = {}): Run {
  return { text, bold: false, italic: false, underline: false, highlight: false, ...extra };
}

function line(text: string, extra: Partial<DocLine> = {}): DocLine {
  return { runs: text === '' ? [] : [run(text)], bullet: false, ...extra };
}

/** A selection from (line1, offset1) to (line2, offset2); with two numbers it is a caret. */
function sel(line1: number, offset1: number, line2 = line1, offset2 = offset1): DocSelection {
  return { anchor: { line: line1, offset: offset1 }, focus: { line: line2, offset: offset2 } };
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) freeze(inner);
  }
  return value;
}

const THREE = (): RichDoc => [line('one'), line('two'), line('three')];

describe('markState and toggleMark', () => {
  it('turns a mark on for the selected text and off again', () => {
    const doc: RichDoc = [line('Hello world')];
    expect(markState(doc, sel(0, 0, 0, 5), 'bold')).toBe('none');
    const bold = toggleMark(doc, sel(0, 0, 0, 5), 'bold');
    expect(docToText(bold)).toBe('**Hello** world');
    expect(markState(bold, sel(0, 0, 0, 5), 'bold')).toBe('all');
    expect(docToText(toggleMark(bold, sel(0, 0, 0, 5), 'bold'))).toBe('Hello world');
  });

  it('works for italic, underline and highlight', () => {
    const doc: RichDoc = [line('Hello world')];
    expect(docToText(toggleMark(doc, sel(0, 0, 0, 5), 'italic'))).toBe('*Hello* world');
    expect(docToText(toggleMark(doc, sel(0, 0, 0, 5), 'underline'))).toBe('__Hello__ world');
    expect(docToText(toggleMark(doc, sel(0, 0, 0, 5), 'highlight'))).toBe('==Hello== world');
  });

  it('a selection that is only partly marked reports "some" and a toggle marks all of it', () => {
    const doc: RichDoc = [{ runs: [run('Hello', { bold: true }), run(' world')], bullet: false }];
    expect(markState(doc, sel(0, 0, 0, 11), 'bold')).toBe('some');
    expect(docToText(toggleMark(doc, sel(0, 0, 0, 11), 'bold'))).toBe('**Hello world**');
  });

  it('a selection made backwards (focus before anchor) acts the same', () => {
    const doc: RichDoc = [line('Hello world')];
    expect(docToText(toggleMark(doc, sel(0, 5, 0, 0), 'bold'))).toBe('**Hello** world');
  });

  it('a caret looks at the text before it (at the start of a line, at the text after it)', () => {
    const doc: RichDoc = [{ runs: [run('Hi', { bold: true }), run(' there')], bullet: false }];
    expect(markState(doc, sel(0, 2), 'bold')).toBe('all');
    expect(markState(doc, sel(0, 3), 'bold')).toBe('none');
    expect(markState(doc, sel(0, 0), 'bold')).toBe('all');
  });

  it('a caret toggle changes nothing in the text', () => {
    const doc: RichDoc = [line('Hello world')];
    const same = toggleMark(doc, sel(0, 3), 'bold');
    expect(same).toEqual(doc);
    expect(docToText(same)).toBe('Hello world');
  });

  it('works across lines: only the selected part of each line is changed', () => {
    const doc: RichDoc = [line('one'), line('two')];
    expect(docToText(toggleMark(doc, sel(0, 1, 1, 2), 'italic'))).toBe('o*ne*\n*tw*o');
  });
});

describe('applyStyle and clearStyle', () => {
  it('sets a colour on the selected text only', () => {
    expect(docToText(applyStyle([line('Hello world')], sel(0, 0, 0, 5), { color: 'red' }))).toBe('{c=red|Hello} world');
  });

  it('null removes a colour; the text goes back to plain', () => {
    const doc: RichDoc = [{ runs: [run('Hello', { color: 'red' }), run(' world')], bullet: false }];
    expect(docToText(applyStyle(doc, sel(0, 0, 0, 5), { color: null }))).toBe('Hello world');
  });

  it('a key that is left out stays as it was (a bold word keeps its bold when it gets a colour)', () => {
    const doc: RichDoc = [{ runs: [run('Hello', { bold: true }), run(' world')], bullet: false }];
    expect(docToText(applyStyle(doc, sel(0, 0, 0, 5), { color: 'red' }))).toBe('{c=red|**Hello**} world');
  });

  it('sets font, size and box together (the span writes them in the order c, f, x, s)', () => {
    const result = applyStyle([line('Hello world')], sel(0, 0, 0, 5), { font: 'serif', size: 'l', box: 'w-dashed' });
    expect(docToText(result)).toBe('{f=serif;x=w-dashed;s=l|Hello} world');
  });

  it('changes only the middle of a run and keeps the rest', () => {
    expect(docToText(applyStyle([line('abcdef')], sel(0, 2, 0, 4), { highlight: true }))).toBe('ab==cd==ef');
  });

  it('a caret or an empty selection changes nothing', () => {
    const doc: RichDoc = [line('Hello')];
    expect(applyStyle(doc, sel(0, 2), { color: 'red' })).toEqual(doc);
  });

  it('a position outside the doc is clamped, never an error', () => {
    const wide = { anchor: { line: 0, offset: -5 }, focus: { line: 0, offset: 99 } };
    expect(docToText(applyStyle([line('Hello world')], wide, { color: 'red' }))).toBe('{c=red|Hello world}');
    expect(docToText(applyStyle(THREE(), sel(7, 0, 9, 9), { bold: true }))).toBe('one\ntwo\n**three**');
  });

  it('clearStyle removes marks, colour, font, box and size', () => {
    const styled: Run = run('Hello', { bold: true, italic: true, color: 'red', font: 'serif', box: 'l-circle-dark', size: 'xl' });
    const doc: RichDoc = [{ runs: [styled, run(' world')], bullet: false }];
    expect(docToText(clearStyle(doc, sel(0, 0, 0, 11)))).toBe('Hello world');
  });
});

describe('what the toolbar asks: colorOf, fontOf, boxOf, sizeOf, styleAt', () => {
  const doc: RichDoc = [
    { runs: [run('Hello', { color: 'red', font: 'serif', size: 'xl', box: 'l-round-dark' }), run(' world')], bullet: false },
  ];

  it('one value when the whole selection has it', () => {
    expect(colorOf(doc, sel(0, 0, 0, 5))).toBe('red');
    expect(fontOf(doc, sel(0, 0, 0, 5))).toBe('serif');
    expect(sizeOf(doc, sel(0, 0, 0, 5))).toBe('xl');
    expect(boxOf(doc, sel(0, 0, 0, 5))).toBe('l-round-dark');
  });

  it('undefined when nothing in the selection has it', () => {
    expect(colorOf(doc, sel(0, 6, 0, 11))).toBeUndefined();
    expect(fontOf(doc, sel(0, 6, 0, 11))).toBeUndefined();
    expect(sizeOf(doc, sel(0, 6, 0, 11))).toBeUndefined();
    expect(boxOf(doc, sel(0, 6, 0, 11))).toBeUndefined();
  });

  it('"mixed" when the selection differs', () => {
    expect(colorOf(doc, sel(0, 0, 0, 11))).toBe('mixed');
    expect(fontOf(doc, sel(0, 0, 0, 11))).toBe('mixed');
    expect(sizeOf(doc, sel(0, 0, 0, 11))).toBe('mixed');
    expect(boxOf(doc, sel(0, 0, 0, 11))).toBe('mixed');
  });

  it('a caret reports the style of the text before it', () => {
    expect(colorOf(doc, sel(0, 3))).toBe('red');
    expect(colorOf(doc, sel(0, 8))).toBeUndefined();
  });

  it('an empty doc reports no style', () => {
    expect(colorOf(emptyDoc(), sel(0, 0))).toBeUndefined();
    expect(markState(emptyDoc(), sel(0, 0), 'bold')).toBe('none');
  });

  it('styleAt gives a copy of the style before the place, or after it at the start of a line', () => {
    const expected = { bold: false, italic: false, underline: false, highlight: false, color: 'red', font: 'serif', size: 'xl', box: 'l-round-dark' };
    expect(styleAt(doc, { line: 0, offset: 5 })).toEqual(expected);
    expect(styleAt(doc, { line: 0, offset: 0 })).toEqual(expected);
    expect(styleAt(emptyDoc(), { line: 0, offset: 0 })).toEqual(PLAIN_STYLE);
  });
});

describe('toggleBullet and setLineBox', () => {
  it('makes the touched lines bullets, and a second toggle turns them off', () => {
    const on = toggleBullet(THREE(), sel(0, 0, 1, 1));
    expect(docToText(on)).toBe('- one\n- two\nthree');
    expect(docToText(toggleBullet(on, sel(0, 0, 1, 1)))).toBe('one\ntwo\nthree');
  });

  it('with a mix of bullets and normal lines, all touched lines become bullets', () => {
    const doc: RichDoc = [line('one', { bullet: true }), line('two')];
    expect(docToText(toggleBullet(doc, sel(0, 0, 1, 3)))).toBe('- one\n- two');
  });

  it('a selection that ends at the very start of a line does not touch that line', () => {
    expect(docToText(toggleBullet(THREE(), sel(0, 0, 1, 0)))).toBe('- one\ntwo\nthree');
  });

  it('a caret toggles its own line', () => {
    expect(docToText(toggleBullet(THREE(), sel(2, 2)))).toBe('one\ntwo\n- three');
  });

  it('sets a paragraph box on the touched lines and removes it with null', () => {
    const boxed = setLineBox(THREE(), sel(1, 1), 'p-dashed');
    expect(docToText(boxed)).toBe('one\n{{x=p-dashed}}two\nthree');
    expect(docToText(setLineBox(boxed, sel(1, 1), null))).toBe('one\ntwo\nthree');
  });

  it('a box on several lines, and on a bullet line', () => {
    expect(docToText(setLineBox(THREE(), sel(0, 0, 2, 1), 'p-round'))).toBe('{{x=p-round}}one\n{{x=p-round}}two\n{{x=p-round}}three');
    const bullet: RichDoc = [line('one', { bullet: true })];
    expect(docToText(setLineBox(bullet, sel(0, 0), 'p-box-light'))).toBe('{{x=p-box-light}}- one');
  });
});

describe('replaceRange: typing, pasting, deleting', () => {
  it('inserts text at the caret and puts the caret behind it', () => {
    const result = replaceRange([line('Hello')], sel(0, 5), ' world');
    expect(flatText(result.doc)).toBe('Hello world');
    expect(result.selection).toEqual(sel(0, 11));
  });

  it('typed text takes the style of the character before it, or the style you give', () => {
    const doc: RichDoc = [{ runs: [run('Hi', { bold: true })], bullet: false }];
    expect(docToText(replaceRange(doc, sel(0, 2), 'x').doc)).toBe('**Hix**');
    expect(docToText(replaceRange(doc, sel(0, 2), 'x', PLAIN_STYLE).doc)).toBe('**Hi**x');
  });

  it('replaces a selection', () => {
    const result = replaceRange([line('Hello world')], sel(0, 6, 0, 11), 'there');
    expect(flatText(result.doc)).toBe('Hello there');
    expect(result.selection).toEqual(sel(0, 11));
  });

  it('empty text deletes the selection', () => {
    const result = replaceRange([line('Hello world')], sel(0, 5, 0, 11), '');
    expect(flatText(result.doc)).toBe('Hello');
    expect(result.selection).toEqual(sel(0, 5));
  });

  it('deleting across lines joins the two pieces', () => {
    const result = replaceRange(THREE(), sel(0, 2, 2, 2), '');
    expect(flatText(result.doc)).toBe('onree');
    expect(result.selection).toEqual(sel(0, 2));
  });

  it('a pasted text with line breaks becomes several lines (\\n, \\r\\n and \\r)', () => {
    for (const pasted of ['X\nY', 'X\r\nY', 'X\rY']) {
      const result = replaceRange([line('ab')], sel(0, 1), pasted);
      expect(flatText(result.doc)).toBe('aX\nYb');
      expect(result.selection).toEqual(sel(1, 1));
    }
  });

  it('new lines of a bullet are bullets; a paragraph box stays on the first line only', () => {
    const bullet = replaceRange([line('one', { bullet: true })], sel(0, 3), 'a\nb');
    expect(docToText(bullet.doc)).toBe('- onea\n- b');
    const boxed = replaceRange([line('ab', { box: 'p-dashed' })], sel(0, 1), 'X\nY');
    expect(docToText(boxed.doc)).toBe('{{x=p-dashed}}aX\nYb');
  });

  it('works on an empty list of lines and on an empty doc', () => {
    expect(flatText(replaceRange([], sel(0, 0), 'hi').doc)).toBe('hi');
    expect(flatText(replaceRange(emptyDoc(), sel(0, 0), 'hi').doc)).toBe('hi');
  });

  it('counts UTF-16 units: a letter outside the basic plane is two, a Gujarati word is its length', () => {
    expect(replaceRange([line('ab')], sel(0, 1), '\u{1F600}').selection).toEqual(sel(0, 3));
    expect(flatText(replaceRange([line('આશા')], sel(0, 3), 'બેન').doc)).toBe('આશાબેન');
  });

  it('characters that mean a mark are stored with a backslash and read back as plain text', () => {
    const stored = docToText(replaceRange([line('a')], sel(0, 1), '*b*').doc);
    expect(stored).toBe('a\\*b\\*');
    expect(flatText(docFromText(stored))).toBe('a*b*');
  });

  it('a position outside the doc is clamped to the end', () => {
    const result = replaceRange(THREE(), sel(9, 99), 'x');
    expect(flatText(result.doc)).toBe('one\ntwo\nthreex');
    expect(result.selection).toEqual(sel(2, 6));
  });
});

describe('enter', () => {
  it('splits the line at the caret', () => {
    const result = enter([line('Hello world')], sel(0, 5));
    expect(flatText(result.doc)).toBe('Hello\n world');
    expect(result.selection).toEqual(sel(1, 0));
  });

  it('at the end of a line it opens an empty line that is not stored', () => {
    const result = enter([line('Hello')], sel(0, 5));
    expect(result.doc).toHaveLength(2);
    expect(result.selection).toEqual(sel(1, 0));
    expect(docToText(result.doc)).toBe('Hello');
  });

  it('deletes the selection first', () => {
    expect(flatText(enter([line('Hello world')], sel(0, 5, 0, 6)).doc)).toBe('Hello\nworld');
  });

  it('keeps both halves styled and the paragraph box on the first half only', () => {
    const bold: RichDoc = [{ runs: [run('Hello', { bold: true })], bullet: false }];
    expect(docToText(enter(bold, sel(0, 2)).doc)).toBe('**He**\n**llo**');
    const boxed = enter([line('Hello', { box: 'p-dashed' })], sel(0, 2));
    expect(boxed.doc.map((item) => item.box)).toEqual(['p-dashed', undefined]);
  });

  it('Enter in a bullet starts the next bullet; Enter in an EMPTY bullet ends the list', () => {
    const next = enter([line('one', { bullet: true })], sel(0, 3));
    expect(next.doc.map((item) => item.bullet)).toEqual([true, true]);
    expect(next.selection).toEqual(sel(1, 0));
    const ended = enter(next.doc, next.selection);
    expect(ended.doc.map((item) => item.bullet)).toEqual([true, false]);
    expect(ended.selection).toEqual(sel(1, 0));
    expect(docToText(ended.doc)).toBe('- one');
  });
});

describe('carets', () => {
  it('caretAt makes an empty selection and isCollapsed knows it', () => {
    const caret = caretAt({ line: 1, offset: 2 });
    expect(caret.anchor).toEqual(caret.focus);
    expect(isCollapsed(caret)).toBe(true);
    expect(isCollapsed(sel(0, 0, 0, 1))).toBe(false);
  });
});

describe('safety', () => {
  const docs: RichDoc[] = [[], emptyDoc(), [line('Hello')], [line('a', { bullet: true }), line('')]];
  const selections: DocSelection[] = [
    sel(-1, -1),
    sel(99, 99),
    sel(0, 5, 0, 0),
    { anchor: { line: Number.NaN, offset: Number.NaN }, focus: { line: Number.POSITIVE_INFINITY, offset: Number.POSITIVE_INFINITY } },
  ];

  it('no function throws on an empty doc, on out-of-range or odd positions, and an edit always leaves a valid caret', () => {
    for (const doc of docs) {
      for (const selection of selections) {
        expect(() => {
          markState(doc, selection, 'bold');
          colorOf(doc, selection);
          fontOf(doc, selection);
          boxOf(doc, selection);
          sizeOf(doc, selection);
          toggleMark(doc, selection, 'italic');
          applyStyle(doc, selection, { color: 'red' });
          clearStyle(doc, selection);
          toggleBullet(doc, selection);
          setLineBox(doc, selection, 'p-round');
        }).not.toThrow();
        for (const result of [replaceRange(doc, selection, 'x\ny'), replaceRange(doc, selection, ''), enter(doc, selection)]) {
          expect(result.doc.length).toBeGreaterThan(0);
          const target = result.doc[result.selection.focus.line];
          expect(target).toBeDefined();
          if (target !== undefined) expect(result.selection.focus.offset).toBeLessThanOrEqual(lineLength(target));
        }
      }
    }
  });

  it('never changes its input: every function works on a deeply frozen doc', () => {
    const doc = freeze<RichDoc>([
      { runs: [run('Hello', { bold: true }), run(' world', { color: 'red' })], bullet: false },
      { runs: [run('item')], bullet: true, box: 'p-dashed' },
    ]);
    const selection = sel(0, 2, 1, 3);
    expect(() => {
      toggleMark(doc, selection, 'bold');
      applyStyle(doc, selection, { color: null, size: 'l' });
      clearStyle(doc, selection);
      toggleBullet(doc, selection);
      setLineBox(doc, selection, null);
      replaceRange(doc, selection, 'a\nb');
      enter(doc, selection);
    }).not.toThrow();
    expect(PLAIN_STYLE).toEqual({ bold: false, italic: false, underline: false, highlight: false });
  });
});

describe('edits and the stored text', () => {
  it('after a series of edits the stored text reads back to the same stored text', () => {
    let doc: RichDoc = [line('Hello world')];
    doc = toggleMark(doc, sel(0, 0, 0, 5), 'bold');
    doc = applyStyle(doc, sel(0, 6, 0, 11), { color: 'green', size: 'l' });
    doc = replaceRange(doc, sel(0, 11), ' again').doc;
    const stored = docToText(doc);
    expect(stored).toBe('**Hello** {c=green;s=l|world again}');
    expect(docToText(docFromText(stored))).toBe(stored);

    doc = toggleBullet(doc, sel(0, 0));
    doc = enter(doc, sel(0, 3)).doc;
    const withList = docToText(doc);
    expect(docToText(docFromText(withList))).toBe(withList);
  });
});
