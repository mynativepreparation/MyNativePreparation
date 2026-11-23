// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, plainText, type Run } from './inline';

type Flag = 'bold' | 'italic' | 'underline' | 'highlight';

/** A run with only the named flags on. */
function run(text: string, ...on: Flag[]): Run {
  return {
    text,
    bold: on.includes('bold'),
    italic: on.includes('italic'),
    underline: on.includes('underline'),
    highlight: on.includes('highlight'),
  };
}

describe('parseInline: one mark at a time', () => {
  it('plain text is one run without flags', () => {
    expect(parseInline('hello world')).toEqual([run('hello world')]);
  });

  it('empty text gives no runs', () => {
    expect(parseInline('')).toEqual([]);
  });

  it.each([
    ['**bold**', 'bold'],
    ['*italic*', 'italic'],
    ['__underline__', 'underline'],
    ['==highlight==', 'highlight'],
  ] as Array<[string, Flag]>)('%s turns the flag %s on', (input, flag) => {
    expect(parseInline(input)).toEqual([run(flag, flag)]);
  });

  it('keeps the plain parts around a marked part', () => {
    expect(parseInline('a **b** c')).toEqual([run('a '), run('b', 'bold'), run(' c')]);
  });

  it('handles two different marks in one line', () => {
    expect(parseInline('**a** and *b*')).toEqual([run('a', 'bold'), run(' and '), run('b', 'italic')]);
  });

  it('works inside a word', () => {
    expect(parseInline('un**believ**able')).toEqual([run('un'), run('believ', 'bold'), run('able')]);
  });
});

describe('parseInline: combined marks', () => {
  it('***x*** is bold and italic', () => {
    expect(parseInline('***x***')).toEqual([run('x', 'bold', 'italic')]);
  });

  it('italic inside bold', () => {
    expect(parseInline('**a *b* c**')).toEqual([run('a ', 'bold'), run('b', 'bold', 'italic'), run(' c', 'bold')]);
  });

  it('underline and highlight together', () => {
    expect(parseInline('__==x==__')).toEqual([run('x', 'underline', 'highlight')]);
  });
});

describe('parseInline: Gujarati', () => {
  it('marks Gujarati words and keeps conjuncts intact', () => {
    expect(parseInline('**ક્ષત્રિય** અને *જ્ઞાન*')).toEqual([run('ક્ષત્રિય', 'bold'), run(' અને '), run('જ્ઞાન', 'italic')]);
  });
});

describe('parseInline: things that are NOT marks', () => {
  it('stars with spaces around them stay plain', () => {
    expect(parseInline('a * b * c')).toEqual([run('a * b * c')]);
    expect(parseInline('2 * 3 * 4 = 24')).toEqual([run('2 * 3 * 4 = 24')]);
  });

  it('a mark that is never closed stays plain', () => {
    expect(parseInline('**abc')).toEqual([run('**abc')]);
    expect(parseInline('2*3')).toEqual([run('2*3')]);
    expect(parseInline('==abc')).toEqual([run('==abc')]);
    expect(parseInline('__abc')).toEqual([run('__abc')]);
  });

  it('only the unclosed mark is plain, a closed one next to it still works', () => {
    expect(parseInline('**a** and **b')).toEqual([run('a', 'bold'), run(' and **b')]);
  });

  it('empty marks stay plain', () => {
    expect(parseInline('****')).toEqual([run('****')]);
    expect(parseInline('====')).toEqual([run('====')]);
  });

  it('a single underscore or equals sign is never a mark', () => {
    expect(parseInline('snake_case_name')).toEqual([run('snake_case_name')]);
    expect(parseInline('a = b = c')).toEqual([run('a = b = c')]);
  });

  it('a mark with a space inside its edge is not closed', () => {
    expect(parseInline('**a **b')).toEqual([run('**a **b')]);
  });
});

describe('parseInline: escapes', () => {
  it('a backslash shows the mark character as plain text', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([run('*not italic*')]);
    expect(parseInline('\\*\\*x\\*\\*')).toEqual([run('**x**')]);
  });

  it('an escaped backslash is one backslash', () => {
    expect(parseInline('a\\\\b')).toEqual([run('a\\b')]);
  });

  it('a backslash before an ordinary character stays', () => {
    expect(parseInline('a\\b')).toEqual([run('a\\b')]);
  });

  it('a backslash at the very end stays', () => {
    expect(parseInline('a\\')).toEqual([run('a\\')]);
  });

  it('escapes also work for underline, highlight and dash', () => {
    expect(parseInline('\\_\\_x\\_\\_ \\=\\=y\\=\\= \\-')).toEqual([run('__x__ ==y== -')]);
  });
});

describe('parseRichText', () => {
  it('empty and blank text give nothing', () => {
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText('  \n\n \n')).toEqual([]);
  });

  it('every non-empty line is a paragraph', () => {
    expect(parseRichText('one\n\ntwo\nthree')).toEqual([
      { type: 'paragraph', runs: [run('one')] },
      { type: 'paragraph', runs: [run('two')] },
      { type: 'paragraph', runs: [run('three')] },
    ]);
  });

  it('consecutive "- " lines make one list, with marks inside the items', () => {
    expect(parseRichText('- a\n- **b**\n- c')).toEqual([
      { type: 'list', items: [[run('a')], [run('b', 'bold')], [run('c')]] },
    ]);
  });

  it('text, list, text keeps the order', () => {
    expect(parseRichText('intro\n- a\n- b\nend')).toEqual([
      { type: 'paragraph', runs: [run('intro')] },
      { type: 'list', items: [[run('a')], [run('b')]] },
      { type: 'paragraph', runs: [run('end')] },
    ]);
  });

  it('a blank line between bullets still keeps them in one list', () => {
    expect(parseRichText('- a\n\n- b')).toEqual([{ type: 'list', items: [[run('a')], [run('b')]] }]);
  });

  it('a dash without a space, or an escaped dash, is not a bullet', () => {
    expect(parseRichText('-a')).toEqual([{ type: 'paragraph', runs: [run('-a')] }]);
    expect(parseRichText('\\- a')).toEqual([{ type: 'paragraph', runs: [run('- a')] }]);
  });

  it('accepts Windows line breaks', () => {
    expect(parseRichText('a\r\n- b')).toEqual([
      { type: 'paragraph', runs: [run('a')] },
      { type: 'list', items: [[run('b')]] },
    ]);
  });

  it('marks do not carry over to the next line', () => {
    expect(parseRichText('**a\nb**')).toEqual([
      { type: 'paragraph', runs: [run('**a')] },
      { type: 'paragraph', runs: [run('b**')] },
    ]);
  });
});

describe('plainText', () => {
  it('removes the marks and keeps the words', () => {
    expect(plainText('**a** *b* __c__ ==d==')).toBe('a b c d');
  });

  it('keeps bullets as "- " lines', () => {
    expect(plainText('intro\n- **a**\n- b')).toBe('intro\n- a\n- b');
  });

  it('shows escaped characters without the backslash', () => {
    expect(plainText('\\*x\\*')).toBe('*x*');
  });
});

describe('robustness', () => {
  it('never throws and never makes an empty run, for 2000 random strings', () => {
    const alphabet = ['*', '**', '_', '__', '=', '==', '\\', '-', '- ', ' ', '\n', 'a', 'b', 'ક', 'ષ', '1'];
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let n = 0; n < 2000; n++) {
      const length = next() % 14;
      let text = '';
      for (let i = 0; i < length; i++) text += alphabet[next() % alphabet.length];
      const blocks = parseRichText(text);
      const runs = blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs : b.items.flat()));
      runs.forEach((r) => expect(r.text).not.toBe(''));
      expect(typeof plainText(text)).toBe('string');
    }
  });

  it('does not lose any letters: every a, b and Gujarati letter of the input is still in the text', () => {
    const input = '**a** ==b== __ક__ *ષ* \\*a';
    const letters = (s: string) => s.replace(/[^abકષ]/g, '');
    expect(letters(plainText(input))).toBe(letters(input));
  });
});
