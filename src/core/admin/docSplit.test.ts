import { describe, expect, it } from 'vitest';
import { pictureCaret, splitDoc, splitDocText } from './docSplit';
import { docFromText, emptyDoc, lineText, type DocLine, type DocSelection, type RichDoc } from './richDoc';

// Cutting a rich box in two at the caret (P10 T11o O3).

const caret = (line: number, offset: number): DocSelection => ({ anchor: { line, offset }, focus: { line, offset } });

const plainLine = (text: string, bullet = false): DocLine => ({
  runs: [{ text, bold: false, italic: false, underline: false, highlight: false }],
  bullet,
});

const texts = (doc: RichDoc): string[] => doc.map(lineText);
const bullets = (doc: RichDoc): boolean[] => doc.map((line) => line.bullet);

describe('splitDocText', () => {
  it('cuts a line at the caret', () => {
    expect(splitDocText(docFromText('Helloworld'), caret(0, 5))).toEqual({ before: 'Hello', after: 'world' });
  });

  it('a caret at the start leaves the front empty', () => {
    expect(splitDocText(docFromText('Hello'), caret(0, 0))).toEqual({ before: '', after: 'Hello' });
  });

  it('a caret at the end leaves the back empty', () => {
    expect(splitDocText(docFromText('Hello'), caret(0, 5))).toEqual({ before: 'Hello', after: '' });
  });

  it('knowing nothing about the selection means the end of the text', () => {
    expect(splitDocText(docFromText('Hello'), null)).toEqual({ before: 'Hello', after: '' });
  });

  it('an empty box gives two empty halves', () => {
    expect(splitDocText(emptyDoc(), null)).toEqual({ before: '', after: '' });
  });

  it('a selection is cut at its end, whichever way it was made', () => {
    const forward: DocSelection = { anchor: { line: 0, offset: 1 }, focus: { line: 0, offset: 4 } };
    const backward: DocSelection = { anchor: { line: 0, offset: 4 }, focus: { line: 0, offset: 1 } };
    expect(splitDocText(docFromText('abcdef'), forward)).toEqual({ before: 'abcd', after: 'ef' });
    expect(splitDocText(docFromText('abcdef'), backward)).toEqual({ before: 'abcd', after: 'ef' });
  });

  it('a bold word that is cut in two stays bold on both sides', () => {
    expect(splitDocText(docFromText('**bold**'), caret(0, 2))).toEqual({ before: '**bo**', after: '**ld**' });
  });
});

describe('splitDoc', () => {
  it('the lines in front stay in front and the lines behind go behind', () => {
    const doc: RichDoc = [plainLine('one'), plainLine('two'), plainLine('three')];
    const halves = splitDoc(doc, { line: 1, offset: 1 });
    expect(texts(halves.before)).toEqual(['one', 't']);
    expect(texts(halves.after)).toEqual(['wo', 'three']);
  });

  it('a cut at the end of a bullet leaves no empty bullet behind', () => {
    const doc: RichDoc = [plainLine('a', true), plainLine('b', true)];
    const halves = splitDoc(doc, { line: 0, offset: 1 });
    expect(texts(halves.before)).toEqual(['a']);
    expect(bullets(halves.before)).toEqual([true]);
    expect(texts(halves.after)).toEqual(['b']);
    expect(bullets(halves.after)).toEqual([true]);
  });

  it('a cut at the start of a line leaves that line behind and nothing empty in front', () => {
    const doc: RichDoc = [plainLine('one'), plainLine('two')];
    const halves = splitDoc(doc, { line: 1, offset: 0 });
    expect(texts(halves.before)).toEqual(['one']);
    expect(texts(halves.after)).toEqual(['two']);
  });

  it('a half with no text at all is an empty doc', () => {
    const halves = splitDoc([plainLine('one')], { line: 0, offset: 0 });
    expect(texts(halves.before)).toEqual(['']);
    expect(texts(halves.after)).toEqual(['one']);
  });

  it('keeps the paragraph box on both halves of a cut paragraph', () => {
    const boxed: RichDoc = [{ ...plainLine('abcd'), box: 'p-dashed' }];
    const halves = splitDoc(boxed, { line: 0, offset: 2 });
    expect(halves.before.map((line) => line.box)).toEqual(['p-dashed']);
    expect(halves.after.map((line) => line.box)).toEqual(['p-dashed']);
  });

  it('brings a place outside the doc into it', () => {
    const halves = splitDoc([plainLine('ab')], { line: 9, offset: 99 });
    expect(texts(halves.before)).toEqual(['ab']);
    expect(texts(halves.after)).toEqual(['']);
  });

  it('never changes the doc it is given', () => {
    const doc = docFromText('**bold** and more');
    const copy = JSON.parse(JSON.stringify(doc)) as RichDoc;
    splitDoc(doc, { line: 0, offset: 2 });
    expect(doc).toEqual(copy);
  });
});

describe('pictureCaret', () => {
  it('takes the end of the selection and clamps a place outside the doc', () => {
    expect(pictureCaret(docFromText('ab'), caret(5, 99))).toEqual({ line: 0, offset: 2 });
  });

  it('without a selection it is the end of the last line', () => {
    expect(pictureCaret([plainLine('one'), plainLine('three')], null)).toEqual({ line: 1, offset: 5 });
  });
});
