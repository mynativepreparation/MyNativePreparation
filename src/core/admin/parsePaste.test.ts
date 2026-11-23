import { describe, expect, it } from 'vitest';
import { parseTestText } from './parseTest';
import { htmlToMarkedText, itemsToBlocks, parseHtml, parsePlainText } from './parsePaste';

describe('parsePlainText', () => {
  it('splits on blank lines and keeps single line breaks inside a paragraph', () => {
    const items = parsePlainText('પહેલો ફકરો\nબીજી લીટી\n\n\n  \nબીજો ફકરો\r\n\r\nત્રીજો');
    expect(items).toEqual([
      { kind: 'text', text: 'પહેલો ફકરો\nબીજી લીટી' },
      { kind: 'text', text: 'બીજો ફકરો' },
      { kind: 'text', text: 'ત્રીજો' },
    ]);
  });

  it('returns nothing for empty or blank input', () => {
    expect(parsePlainText('')).toEqual([]);
    expect(parsePlainText(' \n\n \t\n')).toEqual([]);
  });
});

describe('parseHtml', () => {
  it('maps headings, paragraphs and list items', () => {
    const html =
      '<h1>શીર્ષક</h1><h2>ઉપશીર્ષક</h2><p>પહેલો   ફકરો\n  ચાલુ</p><ul><li>એક</li><li>બે</li></ul><h3>નાનું</h3>';
    expect(parseHtml(html)).toEqual([
      { kind: 'title', text: 'શીર્ષક' },
      { kind: 'subtitle', text: 'ઉપશીર્ષક' },
      { kind: 'text', text: 'પહેલો ફકરો ચાલુ' },
      { kind: 'text', text: 'એક' },
      { kind: 'text', text: 'બે' },
      { kind: 'subtitle', text: 'નાનું' },
    ]);
  });

  it('understands Word classes, skips styles, comments and empty paragraphs', () => {
    const html =
      '<html><head><style>p {color:red}</style></head><body><!--StartFragment-->' +
      '<p class="MsoTitle"><span>Main</span><o:p></o:p></p>' +
      '<p class="MsoSubtitle">Sub</p><p class="MsoNormal">&nbsp;</p><p class="MsoNormal">Body</p><!--EndFragment--></body></html>';
    expect(parseHtml(html)).toEqual([
      { kind: 'title', text: 'Main' },
      { kind: 'subtitle', text: 'Sub' },
      { kind: 'text', text: 'Body' },
    ]);
  });

  it('returns images in order, after the text of their paragraph, and skips images without src', () => {
    const html = '<p>Before <img src="data:image/png;base64,AAAA" alt=" A  cat "></p><img src="x.png"><img alt="none"><p>After</p>';
    expect(parseHtml(html)).toEqual([
      { kind: 'text', text: 'Before' },
      { kind: 'image', source: 'data:image/png;base64,AAAA', alt: 'A cat' },
      { kind: 'image', source: 'x.png', alt: '' },
      { kind: 'text', text: 'After' },
    ]);
  });

  it('handles divs with loose text and nested divs', () => {
    const html = '<div><div>one</div><div>two <b>bold</b></div>loose</div>';
    expect(parseHtml(html)).toEqual([
      { kind: 'text', text: 'one' },
      { kind: 'text', text: 'two bold' },
      { kind: 'text', text: 'loose' },
    ]);
  });

  it('never runs scripts and ignores them', () => {
    expect(parseHtml('<script>throw new Error("x")</script><p>ok</p>')).toEqual([{ kind: 'text', text: 'ok' }]);
  });

  it('returns nothing for empty html', () => {
    expect(parseHtml('')).toEqual([]);
  });
});

describe('itemsToBlocks', () => {
  const items = parsePlainText('A\n\nB');

  it('creates blk IDs and text blocks', () => {
    const blocks = itemsToBlocks([{ kind: 'title', text: 'T' }, ...items]);
    expect(blocks.map((b) => [b.type, b.text])).toEqual([
      ['title', 'T'],
      ['text', 'A'],
      ['text', 'B'],
    ]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });

  it('skips images without a resolver and uses the resolved path with one', () => {
    const list = [
      { kind: 'text', text: 'x' },
      { kind: 'image', source: 'data:1', alt: 'a1' },
      { kind: 'image', source: 'data:2', alt: 'a2' },
    ] as const;
    expect(itemsToBlocks(list)).toHaveLength(1);
    const blocks = itemsToBlocks(list, (source) => (source === 'data:1' ? 'images/1.webp' : null));
    expect(blocks.map((b) => [b.type, b.src ?? b.text, b.alt])).toEqual([
      ['text', 'x', undefined],
      ['image', 'images/1.webp', 'a1'],
    ]);
  });
});

describe('htmlToMarkedText', () => {
  it('wraps bold runs in ** and gives one line per paragraph', () => {
    const html =
      '<p>1. પ્રશ્ન?</p><p>A) એક</p><p>B) <b>બે</b></p><p><strong>C) ત્રણ</strong></p><p>D) ચાર</p>';
    expect(htmlToMarkedText(html)).toBe('1. પ્રશ્ન?\nA) એક\nB) **બે**\n**C) ત્રણ**\nD) ચાર');
  });

  it('understands bold from style, ignores font-weight normal, and merges neighbouring runs', () => {
    const html =
      '<p><span style="font-weight:700">ab</span><span style="font-weight:bold">cd</span> ef</p>' +
      '<p><b style="font-weight:normal">plain</b></p><p><b>x <b>y</b></b></p><p><b> </b>z</p>';
    expect(htmlToMarkedText(html)).toBe('**abcd** ef\nplain\n**x y**\nz');
  });

  it('feeds parseTestText end to end (Word-like paste)', () => {
    const html =
      '<html><body><!--StartFragment--><p class=MsoNormal>1. ભારતની રાજધાની?<o:p></o:p></p>' +
      '<p class=MsoNormal>A) મુંબઈ</p><p class=MsoNormal>B) <b><span style="font-weight:bold">દિલ્હી</span></b></p>' +
      '<p class=MsoNormal>C) ચેન્નઈ</p><p class=MsoNormal>D) કોલકાતા</p><!--EndFragment--></body></html>';
    const r = parseTestText(htmlToMarkedText(html));
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.options)).toEqual([['મુંબઈ', 'દિલ્હી', 'ચેન્નઈ', 'કોલકાતા']]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([1]);
  });

  it('returns an empty string for empty html', () => {
    expect(htmlToMarkedText('')).toBe('');
  });
});
