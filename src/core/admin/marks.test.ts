import { describe, expect, it } from 'vitest';
import { parseRichText } from '../content/inline';
import { applyMark, toggleBullets, type MarkKind } from './marks';

/** Selects the first `part` found in `text` and applies the mark. */
function mark(text: string, part: string, kind: MarkKind) {
  const start = text.indexOf(part);
  return applyMark(text, start, start + part.length, kind);
}

describe('applyMark: switching a mark on', () => {
  it.each([
    ['bold', '**'],
    ['italic', '*'],
    ['underline', '__'],
    ['highlight', '=='],
  ] as const)('%s wraps the selection in %s and keeps it selected', (kind, marker) => {
    expect(mark('hello world', 'world', kind)).toEqual({
      text: `hello ${marker}world${marker}`,
      selectionStart: 6 + marker.length,
      selectionEnd: 11 + marker.length,
    });
  });

  it('wraps a piece in the middle of a text', () => {
    expect(mark('one two three', 'two', 'bold')?.text).toBe('one **two** three');
  });

  it('moves spaces at the edges of the selection outside the marks', () => {
    expect(mark('a  hello  b', ' hello ', 'bold')?.text).toBe('a  **hello**  b');
  });

  it('works on Gujarati text', () => {
    expect(mark('આ મહત્વપૂર્ણ છે', 'મહત્વપૂર્ણ', 'bold')?.text).toBe('આ **મહત્વપૂર્ણ** છે');
  });

  it('gives text that the reader reads as marked text', () => {
    const edit = mark('hello world', 'world', 'bold');
    expect(edit).not.toBeNull();
    const blocks = parseRichText(edit?.text ?? '');
    expect(blocks.map((block) => block.type)).toEqual(['paragraph']);
    const first = blocks[0];
    expect(first !== undefined && first.type === 'paragraph' ? first.runs.map((run) => [run.text, run.bold]) : null).toEqual([
      ['hello ', false],
      ['world', true],
    ]);
  });

  it('accepts a selection given backwards', () => {
    expect(applyMark('hello world', 11, 6, 'bold')?.text).toBe('hello **world**');
  });

  it('clamps a selection that is outside the text', () => {
    expect(applyMark('abc', -5, 99, 'bold')?.text).toBe('**abc**');
  });
});

describe('applyMark: nothing to mark', () => {
  it('returns null for an empty selection', () => {
    expect(applyMark('hello', 2, 2, 'bold')).toBeNull();
  });

  it('returns null for spaces only', () => {
    expect(applyMark('a   b', 1, 4, 'bold')).toBeNull();
  });

  it('returns null for mark characters only', () => {
    expect(applyMark('a **** b', 2, 6, 'bold')).toBeNull();
  });

  it('returns null for NaN positions and for empty text', () => {
    expect(applyMark('abc', Number.NaN, Number.NaN, 'bold')).toBeNull();
    expect(applyMark('', 0, 0, 'italic')).toBeNull();
  });
});

describe('applyMark: switching a mark off', () => {
  it('removes marks that stand right outside the selection', () => {
    expect(mark('hello **world**', 'world', 'bold')).toEqual({
      text: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it('removes marks that are part of the selection', () => {
    expect(mark('hello **world**', '**world**', 'bold')).toEqual({
      text: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it.each([
    ['italic', '*'],
    ['underline', '__'],
    ['highlight', '=='],
  ] as const)('removes %s the same way', (kind, marker) => {
    expect(mark(`say ${marker}hi${marker} now`, 'hi', kind)?.text).toBe('say hi now');
  });

  it('is the exact opposite of switching on', () => {
    for (const kind of ['bold', 'italic', 'underline', 'highlight'] as const) {
      const on = mark('hello world', 'world', kind);
      expect(on).not.toBeNull();
      const off = applyMark(on?.text ?? '', on?.selectionStart ?? 0, on?.selectionEnd ?? 0, kind);
      expect(off?.text).toBe('hello world');
    }
  });
});

describe('applyMark: bold and italic together', () => {
  it('italic on bold text gives both', () => {
    expect(mark('**word**', 'word', 'italic')?.text).toBe('***word***');
  });

  it('bold on italic text gives both', () => {
    expect(mark('*word*', 'word', 'bold')?.text).toBe('***word***');
  });

  it('removing italic from both leaves bold', () => {
    expect(mark('***word***', 'word', 'italic')?.text).toBe('**word**');
  });

  it('removing bold from both leaves italic', () => {
    expect(mark('***word***', 'word', 'bold')?.text).toBe('*word*');
  });

  it('italic on bold does not remove the bold', () => {
    const text = '**word**';
    expect(mark(text, 'word', 'italic')?.text).not.toBe('word');
  });
});

describe('toggleBullets', () => {
  it('turns the line of the cursor into a bullet', () => {
    expect(toggleBullets('one\ntwo', 1, 1)).toEqual({ text: '- one\ntwo', selectionStart: 0, selectionEnd: 5 });
  });

  it('works with the cursor at the very end of a line', () => {
    expect(toggleBullets('abc', 3, 3).text).toBe('- abc');
  });

  it('turns every touched line into a bullet', () => {
    expect(toggleBullets('one\ntwo\nthree', 1, 6).text).toBe('- one\n- two\nthree');
  });

  it('removes the bullets when every filled line already has one', () => {
    expect(toggleBullets('- one\n- two', 0, 11)).toEqual({ text: 'one\ntwo', selectionStart: 0, selectionEnd: 7 });
  });

  it('adds the missing bullets when only some lines have one', () => {
    expect(toggleBullets('- one\ntwo', 0, 9).text).toBe('- one\n- two');
  });

  it('keeps blank lines blank', () => {
    expect(toggleBullets('one\n\ntwo', 0, 8).text).toBe('- one\n\n- two');
  });

  it('does not include the next line when the selection ends right after a line break', () => {
    expect(toggleBullets('one\ntwo', 0, 4).text).toBe('- one\ntwo');
  });

  it('turns an empty text into a bullet', () => {
    expect(toggleBullets('', 0, 0)).toEqual({ text: '- ', selectionStart: 0, selectionEnd: 2 });
  });

  it('handles a text that starts with a line break', () => {
    expect(toggleBullets('\nabc', 0, 0).text).toBe('- \nabc');
  });

  it('clamps a cursor outside the text', () => {
    expect(toggleBullets('abc', 99, 99).text).toBe('- abc');
  });

  it('works on Gujarati lines', () => {
    expect(toggleBullets('પહેલું\nબીજું', 0, 13).text).toBe('- પહેલું\n- બીજું');
  });

  it('gives bullets that the reader reads as a list', () => {
    const edit = toggleBullets('one\ntwo', 0, 7);
    expect(parseRichText(edit.text).map((block) => block.type)).toEqual(['list']);
  });
});
