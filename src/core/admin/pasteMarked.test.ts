import { describe, expect, it } from 'vitest';
import { isId } from '../content/ids';
import { parseInline, parseRichText } from '../content/inline';
import { parseHtmlMarked, pasteToMarkedBlocks } from './pasteMarked';
import { pasteToBlocks } from './pasteToBlocks';

const texts = (html: string): string[] =>
  parseHtmlMarked(html).map((item) => (item.kind === 'image' ? `[image ${item.source}]` : item.text));

/** What the reader would show for one marked line: the runs as `text` with `*` for each flag, so a test can read them. */
const flagsOf = (line: string): string[] =>
  parseInline(line).map((run) => `${run.text}|${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.underline ? 'u' : ''}`);

const noEncoder = (): Promise<null> => Promise.resolve(null);

describe('parseHtmlMarked: marks', () => {
  it('keeps bold, italic and underline from tags', () => {
    expect(texts('<p>Hello <b>bold</b> and <i>italic</i> and <u>under</u> end</p>')).toEqual([
      'Hello **bold** and *italic* and __under__ end',
    ]);
    expect(texts('<p><strong>a</strong> <em>b</em> <ins>c</ins></p>')).toEqual(['**a** *b* __c__']);
  });

  it('keeps marks that Word writes as inline styles', () => {
    const html =
      '<p><span style="font-weight:700">x</span> <span style="font-style:italic">y</span> <span style="text-decoration:underline">z</span></p>';
    expect(texts(html)).toEqual(['**x** *y* __z__']);
  });

  it('writes combined marks so that the reader sees them all', () => {
    const both = texts('<p><b><i>both</i></b></p>');
    expect(both).toEqual(['***both***']);
    expect(flagsOf(both[0] ?? '')).toEqual(['both|bi']);

    const all = texts('<p><b><i><u>x</u></i></b></p>');
    expect(flagsOf(all[0] ?? '')).toEqual(['x|biu']);
  });

  it('reads neighbouring styles back correctly', () => {
    const line = texts('<p><b>a</b><i>b</i> <u>c</u></p>')[0] ?? '';
    expect(flagsOf(line)).toEqual(['a|b', 'b|i', ' |', 'c|u']);
  });

  it('moves spaces at the edge of a styled piece outside the marks', () => {
    expect(texts('<p>a<b> b </b>c</p>')).toEqual(['a **b** c']);
    expect(texts('<p><b> only edge spaces </b></p>')).toEqual(['**only edge spaces**']);
  });

  it('treats a whole bold paragraph (style on the paragraph) as bold', () => {
    expect(texts('<p style="font-weight:bold">All bold</p>')).toEqual(['**All bold**']);
  });

  it('lets an explicit normal weight win over the tag', () => {
    expect(texts('<p><b style="font-weight:normal">x</b> y</p>')).toEqual(['x y']);
  });

  it('keeps Gujarati text and marks', () => {
    expect(texts('<p>આ <b>મહત્વપૂર્ણ</b> છે</p>')).toEqual(['આ **મહત્વપૂર્ણ** છે']);
  });

  it('collects loose inline content that has no paragraph around it', () => {
    expect(texts('Hello <b>world</b>')).toEqual(['Hello **world**']);
  });
});

describe('parseHtmlMarked: escaping', () => {
  it('shows exactly the pasted characters even when they look like marks', () => {
    const original = '2 * 3 and a_b == c __init__ \\ end';
    const items = texts(`<p>${original}</p>`);
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('\\*');
    expect(flagsOf(items[0] ?? '')).toEqual([`${original}|`]);
  });

  it('does not turn a pasted "- " line into a bullet', () => {
    const items = texts('<p>- not a bullet</p>');
    expect(items).toEqual(['\\- not a bullet']);
    expect(parseRichText(items[0] ?? '').map((block) => block.type)).toEqual(['paragraph']);
  });
});

describe('parseHtmlMarked: structure', () => {
  it('keeps headings as plain title / subtitle text', () => {
    const items = parseHtmlMarked('<h1>My <b>Title</b></h1><h2>Sub *x*</h2><p>Body</p>');
    expect(items).toEqual([
      { kind: 'title', text: 'My Title' },
      { kind: 'subtitle', text: 'Sub *x*' },
      { kind: 'text', text: 'Body' },
    ]);
  });

  it('turns list items into bullet lines and joins consecutive ones into one item', () => {
    expect(texts('<ul><li>One</li><li><b>Two</b></li></ul>')).toEqual(['- One\n- **Two**']);
    expect(texts('<ul><li>A</li></ul><p>B</p><ul><li>C</li></ul>')).toEqual(['- A', 'B', '- C']);
  });

  it('turns the bullet lines into a real list for the reader', () => {
    const item = texts('<ul><li>One</li><li>Two</li></ul>')[0] ?? '';
    expect(parseRichText(item).map((block) => block.type)).toEqual(['list']);
  });

  it('keeps a line break inside a paragraph, and marks stop at the break', () => {
    expect(texts('<p>Line one<br>Line two</p>')).toEqual(['Line one\nLine two']);
    expect(texts('<p><b>a<br>b</b></p>')).toEqual(['**a**\n**b**']);
  });

  it('reads table cells and nested divs one by one', () => {
    expect(texts('<table><tr><td>A</td><td><b>B</b></td></tr></table>')).toEqual(['A', '**B**']);
    expect(texts('<div><div>One</div><div><b>Two</b></div></div>')).toEqual(['One', '**Two**']);
  });

  it('gives picture items next to the text, with the alt text cleaned', () => {
    expect(parseHtmlMarked('<p>Text</p><img src="data:image/png;base64,AAAA" alt="a  b">')).toEqual([
      { kind: 'text', text: 'Text' },
      { kind: 'image', source: 'data:image/png;base64,AAAA', alt: 'a b' },
    ]);
    expect(parseHtmlMarked('<p>Before <img src="x.png" alt="pic"></p>')).toEqual([
      { kind: 'text', text: 'Before' },
      { kind: 'image', source: 'x.png', alt: 'pic' },
    ]);
  });

  it('ignores styles, scripts, comments and empty paragraphs', () => {
    expect(texts('<style>p{font-weight:bold}</style><!-- note --><p>Plain</p><script>x()</script>')).toEqual(['Plain']);
    expect(parseHtmlMarked('')).toEqual([]);
    expect(parseHtmlMarked('<p> </p><p>&nbsp;</p>')).toEqual([]);
  });

  it('never throws for odd input', () => {
    for (const html of ['<', '<p><b>', '</b></p>', '<b><i></b></i>', '\u0000', '<p>' + 'x'.repeat(5000) + '</p>']) {
      expect(() => parseHtmlMarked(html)).not.toThrow();
    }
  });
});

describe('pasteToMarkedBlocks', () => {
  it('makes blocks with the marks, new ids and no font', async () => {
    const result = await pasteToMarkedBlocks(
      { html: '<h1>Chapter</h1><p>Some <b>bold</b> text</p>', text: '' },
      [],
      noEncoder,
    );
    expect(result.blocks.map((block) => [block.type, block.text])).toEqual([
      ['title', 'Chapter'],
      ['text', 'Some **bold** text'],
    ]);
    expect(result.blocks.map((block) => isId('blk', block.id))).toEqual([true, true]);
    expect(result.blocks.map((block) => block.font)).toEqual([undefined, undefined]);
    expect(result.skippedImages).toBe(0);
  });

  it('falls back to the plain text, paragraphs split on blank lines', async () => {
    const result = await pasteToMarkedBlocks({ html: '', text: 'first\n\nsecond' }, [], noEncoder);
    expect(result.blocks.map((block) => block.text)).toEqual(['first', 'second']);
  });

  it('gives no blocks for an empty paste', async () => {
    const result = await pasteToMarkedBlocks({ html: '', text: '  ' }, [], noEncoder);
    expect(result).toEqual({ blocks: [], images: [], skippedImages: 0 });
  });

  it('counts a picture that cannot be taken (not embedded)', async () => {
    const result = await pasteToMarkedBlocks(
      { html: '<p>x</p><img src="https://example.com/a.png">', text: '' },
      [],
      noEncoder,
    );
    expect(result.blocks.map((block) => block.type)).toEqual(['text']);
    expect(result.skippedImages).toBe(1);
  });

  it('leaves the old pasteToBlocks as it was (marks are dropped there)', async () => {
    const result = await pasteToBlocks({ html: '<p>Some <b>bold</b> text</p>', text: '' }, [], noEncoder);
    expect(result.blocks.map((block) => block.text)).toEqual(['Some bold text']);
  });
});
