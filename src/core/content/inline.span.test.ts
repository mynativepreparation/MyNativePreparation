// @vitest-environment node
// Brace spans and paragraph boxes of format v1.1 (DECISIONS Q26 b). The old marks keep their own tests in inline.test.ts.
import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, plainText, type Run, type SpanStyle } from './inline';

type Flag = 'bold' | 'italic' | 'underline' | 'highlight';

/** A run with only the named flags on and only the given span style. */
function run(text: string, flags: Flag[] = [], style: SpanStyle = {}): Run {
  return {
    text,
    bold: flags.includes('bold'),
    italic: flags.includes('italic'),
    underline: flags.includes('underline'),
    highlight: flags.includes('highlight'),
    ...style,
  };
}

describe('parseInline: spans', () => {
  it('a colour span gives the colour to its text only', () => {
    expect(parseInline('{c=red|hello}')).toEqual([run('hello', [], { color: 'red' })]);
  });

  it('keeps the plain text around a span', () => {
    expect(parseInline('a {c=green|b} c')).toEqual([run('a '), run('b', [], { color: 'green' }), run(' c')]);
  });

  it.each([
    ['{f=humanist|x}', { font: 'humanist' }],
    ['{s=s|x}', { size: 's' }],
    ['{s=xxl|x}', { size: 'xxl' }],
    ['{x=w-dashed|x}', { box: 'w-dashed' }],
    ['{x=l-diamond-light|x}', { box: 'l-diamond-light' }],
    ['{c=purple|x}', { color: 'purple' }],
  ] as Array<[string, SpanStyle]>)('%s sets exactly one key', (input, style) => {
    expect(parseInline(input)).toEqual([run('x', [], style)]);
  });

  it('one span can set colour, font, box and size together, with Gujarati text', () => {
    expect(parseInline('{c=blue;f=serif;x=l-circle-dark;s=xl|ક્ષત્રિય}')).toEqual([
      run('ક્ષત્રિય', [], { color: 'blue', font: 'serif', box: 'l-circle-dark', size: 'xl' }),
    ]);
  });

  it('the order of the keys does not matter', () => {
    expect(parseInline('{s=l;c=pink|x}')).toEqual(parseInline('{c=pink;s=l|x}'));
  });

  it('a run without a span has no style keys at all', () => {
    const [only] = parseInline('plain');
    expect(Object.keys(only).sort()).toEqual(['bold', 'highlight', 'italic', 'text', 'underline']);
  });

  it('spans may be nested: the inner span wins for the keys it sets', () => {
    expect(parseInline('{c=red|a {c=blue|b} c}')).toEqual([
      run('a ', [], { color: 'red' }),
      run('b', [], { color: 'blue' }),
      run(' c', [], { color: 'red' }),
    ]);
  });

  it('an inner span with another key adds to the outer one', () => {
    expect(parseInline('{c=red|a {f=serif|b}}')).toEqual([
      run('a ', [], { color: 'red' }),
      run('b', [], { color: 'red', font: 'serif' }),
    ]);
  });

  it('two neighbouring spans with the same style become one run', () => {
    expect(parseInline('{c=red|a}{c=red|b}')).toEqual([run('ab', [], { color: 'red' })]);
  });

  it('two neighbouring spans with different styles stay two runs', () => {
    expect(parseInline('{c=red|a}{c=blue|b}')).toEqual([run('a', [], { color: 'red' }), run('b', [], { color: 'blue' })]);
  });
});

describe('parseInline: spans together with the old marks', () => {
  it('a mark inside a span', () => {
    expect(parseInline('{c=red|**b** c}')).toEqual([run('b', ['bold'], { color: 'red' }), run(' c', [], { color: 'red' })]);
  });

  it('a span inside a mark', () => {
    expect(parseInline('**{c=red|a}**')).toEqual([run('a', ['bold'], { color: 'red' })]);
  });

  it('italic and underline around a boxed word', () => {
    expect(parseInline('*__{x=w-box-dark|ok}__*')).toEqual([run('ok', ['italic', 'underline'], { box: 'w-box-dark' })]);
  });

  it('marks and spans that overlap without nesting still keep every letter', () => {
    expect(parseInline('**a {c=red|b** c}')).toEqual([
      run('a ', ['bold']),
      run('b', ['bold'], { color: 'red' }),
      run(' c', [], { color: 'red' }),
    ]);
  });

  it('a mark does not open when a span edge is followed by a space (same rule as before)', () => {
    expect(parseInline('{c=red|** a}')).toEqual([run('** a', [], { color: 'red' })]);
  });
});

describe('parseInline: broken spans stay plain text (nothing is lost)', () => {
  it.each([
    ['unknown colour', '{c=mauve|x}'],
    ['unknown key', '{q=red|x}'],
    ['unknown font', '{f=comic|x}'],
    ['unknown size', '{s=huge|x}'],
    ['repeated key', '{c=red;c=blue|x}'],
    ['paragraph box inside a span', '{x=p-dashed|x}'],
    ['no bar', '{c=red}'],
    ['never closed', '{c=red|abc'],
    ['stray closing brace', 'a}b'],
    ['empty span', '{c=red|}'],
    ['upper case key', '{C=red|x}'],
    ['upper case id', '{c=Red|x}'],
    ['trailing semicolon', '{c=red;|x}'],
    ['no key', '{=red|x}'],
    ['no value', '{c=|x}'],
    ['spaces in the header', '{c = red|x}'],
  ])('%s: %s', (_why, input) => {
    expect(parseInline(input)).toEqual([run(input)]);
  });

  it('a good span next to a broken one still works', () => {
    expect(parseInline('{c=red|a} {c=mauve|b}')).toEqual([run('a', [], { color: 'red' }), run(' {c=mauve|b}')]);
  });

  it('an unclosed inner span does not break the outer one', () => {
    expect(parseInline('{c=red|a {f=serif|b}')).toEqual([run('{c=red|a '), run('b', [], { font: 'serif' })]);
  });
});

describe('parseInline: escapes for the new characters', () => {
  it('escaped braces show as plain text', () => {
    expect(parseInline('\\{c=red|x\\}')).toEqual([run('{c=red|x}')]);
  });

  it('an escaped bar is a plain bar', () => {
    expect(parseInline('a\\|b')).toEqual([run('a|b')]);
  });

  it('an escaped closing brace inside a span is text of the span', () => {
    expect(parseInline('{c=red|\\}}')).toEqual([run('}', [], { color: 'red' })]);
  });

  it('a lone brace or bar is plain text', () => {
    expect(parseInline('{ a | b }')).toEqual([run('{ a | b }')]);
  });
});

describe('parseRichText: paragraph boxes', () => {
  it('a prefix puts a box around the paragraph and is not shown', () => {
    expect(parseRichText('{{x=p-dashed}}hello')).toEqual([{ type: 'paragraph', runs: [run('hello')], box: 'p-dashed' }]);
  });

  it('works for every paragraph box id', () => {
    ['p-box-light', 'p-box-dark', 'p-round', 'p-dashed', 'p-double', 'p-leftbar', 'p-shadow'].forEach((id) => {
      expect(parseRichText(`{{x=${id}}}a`)).toEqual([{ type: 'paragraph', runs: [run('a')], box: id }]);
    });
  });

  it('spans and marks work after the prefix', () => {
    expect(parseRichText('{{x=p-round}}**a** {c=red|b}')).toEqual([
      { type: 'paragraph', runs: [run('a', ['bold']), run(' '), run('b', [], { color: 'red' })], box: 'p-round' },
    ]);
  });

  it('only the prefixed line gets the box', () => {
    expect(parseRichText('one\n{{x=p-shadow}}two\nthree')).toEqual([
      { type: 'paragraph', runs: [run('one')] },
      { type: 'paragraph', runs: [run('two')], box: 'p-shadow' },
      { type: 'paragraph', runs: [run('three')] },
    ]);
  });

  it('a paragraph without a prefix has no box key', () => {
    const [block] = parseRichText('plain');
    expect('box' in block).toBe(false);
  });

  it('a prefix in front of "- " starts a NEW list that has the box', () => {
    expect(parseRichText('- a\n{{x=p-box-light}}- b\n- c')).toEqual([
      { type: 'list', items: [[run('a')]] },
      { type: 'list', items: [[run('b')], [run('c')]], box: 'p-box-light' },
    ]);
  });

  it('a list without a prefix has no box key', () => {
    const [block] = parseRichText('- a');
    expect('box' in block).toBe(false);
  });

  it('a prefix with nothing after it is dropped like an empty line', () => {
    expect(parseRichText('{{x=p-round}}')).toEqual([]);
    expect(parseRichText('a\n{{x=p-round}}   \nb')).toEqual([
      { type: 'paragraph', runs: [run('a')] },
      { type: 'paragraph', runs: [run('b')] },
    ]);
  });

  it.each([
    ['unknown id', '{{x=nope}}hi'],
    ['a letter box id', '{{x=l-circle-dark}}hi'],
    ['a word box id', '{{x=w-box-light}}hi'],
    ['wrong key', '{{c=red}}hi'],
    ['single braces', '{x=p-dashed}hi'],
    ['not at the start of the line', ' {{x=p-dashed}}hi'],
  ])('%s: the prefix stays as plain text', (_why, line) => {
    expect(parseRichText(line)).toEqual([{ type: 'paragraph', runs: [run(line)] }]);
  });

  it('an escaped first brace shows the prefix as plain text (the backslash is used up)', () => {
    expect(parseRichText('\\{{x=p-dashed}}hi')).toEqual([{ type: 'paragraph', runs: [run('{{x=p-dashed}}hi')] }]);
  });

  it('plainText shows neither the prefix nor the span braces', () => {
    expect(plainText('{{x=p-dashed}}{c=red|a} b\n{{x=p-round}}- c')).toBe('a b\n- c');
  });
});

describe('robustness of format v1.1', () => {
  it('never throws, never makes an empty run, and keeps every digit and Gujarati letter, for 3000 random strings', () => {
    const alphabet = [
      '{',
      '}',
      '|',
      ';',
      '=',
      '*',
      '__',
      '\\',
      '- ',
      ' ',
      '\n',
      '{c=red|',
      '{f=serif|',
      '{x=l-circle-dark|',
      '{x=w-box-light|',
      '{s=xl|',
      '{c=blue;s=l|',
      '{{x=p-dashed}}',
      '{{x=nope}}',
      'ક',
      'ષ',
      '1',
      '2',
    ];
    let seed = 987654;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const keep = (s: string) => s.replace(/[^કષ12]/g, '');
    for (let n = 0; n < 3000; n++) {
      const length = next() % 16;
      let text = '';
      for (let i = 0; i < length; i++) text += alphabet[next() % alphabet.length];
      const blocks = parseRichText(text);
      const runs = blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs : b.items.flat()));
      runs.forEach((r) => expect(r.text).not.toBe(''));
      expect(keep(plainText(text))).toBe(keep(text));
    }
  });
});
