// @vitest-environment node
// T11l: the pure editor engine, part 1: writing the stored text, reading it back, positions. Part 2 (changing text) is richDoc.edit.test.ts.
import { describe, expect, it } from 'vitest';
import { parseInline, type Run } from '../content/inline';
import {
  clampPosition,
  comparePositions,
  docFromText,
  docToText,
  emptyDoc,
  flatText,
  flatToPosition,
  lineText,
  mergeRuns,
  positionToFlat,
  rangeOf,
  serializeRuns,
  sliceRuns,
  type DocLine,
} from './richDoc';

function run(text: string, extra: Partial<Run> = {}): Run {
  return { text, bold: false, italic: false, underline: false, highlight: false, ...extra };
}

function line(text: string, extra: Partial<DocLine> = {}): DocLine {
  return { runs: text === '' ? [] : [run(text)], bullet: false, ...extra };
}

/** Compares runs without caring about the order of the keys. */
function normal(runs: readonly Run[]): string {
  return JSON.stringify(runs.map((item) => Object.entries(item).sort(([a], [b]) => a.localeCompare(b))));
}

const FLAG_SETS = Array.from({ length: 16 }, (_, i) => ({
  bold: (i & 1) !== 0,
  italic: (i & 2) !== 0,
  underline: (i & 4) !== 0,
  highlight: (i & 8) !== 0,
}));

const SPAN_SETS: Array<Partial<Run>> = [
  {},
  { color: 'red' },
  { color: 'blue', font: 'serif' },
  { box: 'l-circle-dark', size: 'l' },
];

describe('serializeRuns: marks', () => {
  it('writes plain text as it is and nothing for no runs', () => {
    expect(serializeRuns([run('Hello')])).toBe('Hello');
    expect(serializeRuns([])).toBe('');
  });

  it('writes every mark', () => {
    expect(serializeRuns([run('Hi', { bold: true })])).toBe('**Hi**');
    expect(serializeRuns([run('Hi', { italic: true })])).toBe('*Hi*');
    expect(serializeRuns([run('Hi', { underline: true })])).toBe('__Hi__');
    expect(serializeRuns([run('Hi', { highlight: true })])).toBe('==Hi==');
  });

  it('writes several marks in a fixed order and closes them in the reverse order', () => {
    expect(serializeRuns([run('Hi', { bold: true, italic: true })])).toBe('***Hi***');
    expect(serializeRuns([run('Hi', { underline: true, highlight: true })])).toBe('__==Hi==__');
  });

  it('writes a mark only where it starts and ends', () => {
    expect(serializeRuns([run('a', { italic: true }), run('b', { bold: true })])).toBe('*a***b**');
    expect(serializeRuns([run('a', { bold: true, italic: true }), run('b', { italic: true })])).toBe('***a**b*');
  });

  it('keeps spaces outside the marks', () => {
    expect(serializeRuns([run('a ', { bold: true })])).toBe('**a** ');
    expect(serializeRuns([run(' a', { bold: true })])).toBe(' **a**');
    expect(serializeRuns([run('  ', { bold: true })])).toBe('  ');
    expect(serializeRuns([run('a b', { bold: true })])).toBe('**a b**');
  });

  it('never loses text at a space edge', () => {
    const cases: Run[][] = [
      [run('a ', { bold: true }), run('b')],
      [run(' a', { bold: true })],
      [run('  ', { bold: true, italic: true })],
      [run(' a ', { bold: true, color: 'red' })],
      [run('x ', { underline: true }), run(' y', { highlight: true })],
    ];
    cases.forEach((runs) => {
      const back = parseInline(serializeRuns(runs));
      expect(back.map((item) => item.text).join('')).toBe(runs.map((item) => item.text).join(''));
    });
  });
});

describe('serializeRuns: spans and escapes', () => {
  it('writes a span with its keys in the order c, f, x, s', () => {
    expect(serializeRuns([run('Hi', { color: 'red' })])).toBe('{c=red|Hi}');
    expect(serializeRuns([run('Hi', { color: 'red', font: 'serif', box: 'l-circle-dark', size: 'l' })])).toBe(
      '{c=red;f=serif;x=l-circle-dark;s=l|Hi}',
    );
  });

  it('puts the marks inside the span and the spaces of a styled run inside the span too', () => {
    expect(serializeRuns([run('Hi', { bold: true, color: 'red' })])).toBe('{c=red|**Hi**}');
    expect(serializeRuns([run(' a ', { bold: true, color: 'red' })])).toBe('{c=red| **a** }');
  });

  it('starts a new span and reopens the marks when the span changes', () => {
    expect(serializeRuns([run('a', { bold: true, color: 'red' }), run('b', { bold: true, color: 'blue' })])).toBe(
      '{c=red|**a**}{c=blue|**b**}',
    );
    expect(serializeRuns([run('a', { color: 'red' }), run('b')])).toBe('{c=red|a}b');
  });

  it('puts a backslash in front of every character that could be read as a mark or a span', () => {
    expect(serializeRuns([run('2*3')])).toBe('2\\*3');
    expect(serializeRuns([run('a_b=c')])).toBe('a\\_b\\=c');
    expect(serializeRuns([run('{x}')])).toBe('\\{x\\}');
    expect(serializeRuns([run('back\\slash')])).toBe('back\\\\slash');
  });

  it('keeps nasty text exactly, plain, bold and inside a span', () => {
    const nasty = ['*', '**', '***', '_', '__', '==', '=', '{', '}', '{c=red|x}', '|', '\\', '\\*', 'a * b', '**a', 'x**', '*a*b*', '___a___', '{{x=p-dashed}}y'];
    nasty.forEach((text) => {
      for (const extra of [{}, { bold: true }, { color: 'red' }, { bold: true, color: 'blue' }] as Array<Partial<Run>>) {
        const runs = [run(text, extra)];
        expect(normal(parseInline(serializeRuns(runs)))).toBe(normal(runs));
      }
    });
  });
});

describe('serializeRuns: reads back as the same runs', () => {
  it('for every pair of mark combinations (256 cases)', () => {
    const failures: string[] = [];
    for (const first of FLAG_SETS) {
      for (const second of FLAG_SETS) {
        const runs = mergeRuns([run('a', first), run('b', second)]);
        if (normal(parseInline(serializeRuns(runs))) !== normal(runs)) {
          failures.push(`${JSON.stringify(first)} then ${JSON.stringify(second)} -> ${serializeRuns(runs)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('for every triple of mark combinations (4096 cases)', () => {
    const failures: string[] = [];
    for (const first of FLAG_SETS) {
      for (const second of FLAG_SETS) {
        for (const third of FLAG_SETS) {
          const runs = mergeRuns([run('a', first), run('b c', second), run('d', third)]);
          if (normal(parseInline(serializeRuns(runs))) !== normal(runs)) {
            failures.push(`${JSON.stringify([first, second, third])} -> ${serializeRuns(runs)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('for every pair of runs with different span styles and marks (4096 cases)', () => {
    const failures: string[] = [];
    const all = SPAN_SETS.flatMap((span) => FLAG_SETS.map((flags) => ({ ...span, ...flags })));
    for (const first of all) {
      for (const second of all) {
        const runs = mergeRuns([run('a', first), run('b', second)]);
        if (normal(parseInline(serializeRuns(runs))) !== normal(runs)) {
          failures.push(`${JSON.stringify(first)} then ${JSON.stringify(second)} -> ${serializeRuns(runs)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('docFromText', () => {
  it('gives one empty paragraph for an empty text', () => {
    expect(docFromText('')).toEqual(emptyDoc());
    expect(docFromText('   \n\n')).toEqual(emptyDoc());
    expect(emptyDoc()).toEqual([{ runs: [], bullet: false }]);
  });

  it('makes one line per paragraph and ignores empty lines, also with Windows line breaks', () => {
    expect(docFromText('a\n\nb').map(lineText)).toEqual(['a', 'b']);
    expect(docFromText('a\r\nb').map(lineText)).toEqual(['a', 'b']);
  });

  it('makes bullet lines', () => {
    const doc = docFromText('- a\n- b\nc');
    expect(doc.map((item) => item.bullet)).toEqual([true, true, false]);
    expect(doc.map(lineText)).toEqual(['a', 'b', 'c']);
  });

  it('puts the paragraph box on the line, and on the first item of a boxed list only', () => {
    expect(docFromText('{{x=p-dashed}}hello')).toEqual([{ runs: [run('hello')], bullet: false, box: 'p-dashed' }]);
    expect(docFromText('{{x=p-box-light}}- a\n- b').map((item) => item.box ?? null)).toEqual(['p-box-light', null]);
  });

  it('keeps marks and spans as runs', () => {
    expect(docFromText('x **b** {c=red|r}')[0]?.runs).toEqual([
      run('x '),
      run('b', { bold: true }),
      run(' '),
      run('r', { color: 'red' }),
    ]);
  });
});

describe('docToText', () => {
  it('does not store lines without visible text, but keeps an empty bullet', () => {
    expect(docToText([line('a'), line(''), line('   '), line('b')])).toBe('a\nb');
    expect(docToText([{ runs: [], bullet: true }])).toBe('- ');
    expect(docToText(emptyDoc())).toBe('');
  });

  it('writes bullets and paragraph boxes', () => {
    expect(docToText([line('a', { bullet: true }), line('b', { bullet: true })])).toBe('- a\n- b');
    expect(docToText([line('x', { box: 'p-round' })])).toBe('{{x=p-round}}x');
    expect(docToText([line('a', { bullet: true, box: 'p-dashed' }), line('b', { bullet: true })])).toBe('{{x=p-dashed}}- a\n- b');
  });

  it('protects a text that starts with "- " so it does not become a bullet', () => {
    const text = docToText([line('- x')]);
    expect(text).toBe('\\- x');
    const back = docFromText(text);
    expect(back.map((item) => item.bullet)).toEqual([false]);
    expect(back.map(lineText)).toEqual(['- x']);
  });

  it('keeps the text of a plain line with special characters', () => {
    ['*', '**a', '- ', '-', '{{x=p-dashed}}y', '{c=red|x}', ' ** ', 'a\\b'].forEach((text) => {
      const back = docFromText(docToText([line(text)]));
      expect(back.map(lineText)).toEqual([text]);
    });
  });
});

describe('docFromText and docToText together', () => {
  const samples = [
    'Plain text',
    '**bold** and *italic* and __under__ and ==mark==',
    '***both*** text',
    '{c=red|red} and {c=blue;f=serif|blue serif}',
    '{c=red;f=serif;x=l-circle-dark;s=xl|all four}',
    '{c=red|**bold red** plain *i*}',
    'ગુજરાતી **જાડા** અક્ષર',
    '- one\n- two **b**',
    '{{x=p-dashed}}boxed',
    '{{x=p-round}}- a\n- b',
    '- a\nplain\n- b',
    '2 * 3 * 4',
    'unclosed **bold',
    '**a ** b',
    'a \\* b',
    'back\\\\slash',
    '{c=nope|x}',
    '{c=red| a }',
    '**a** **b**',
    '*a***b**',
    '***a**b*',
    'x {c=red|y} z',
    '- ',
  ];

  it('reads the written text back as the same doc', () => {
    samples.forEach((sample) => {
      const doc = docFromText(sample);
      expect(docFromText(docToText(doc))).toEqual(doc);
    });
  });

  it('writes the same text again (the written form is stable)', () => {
    samples.forEach((sample) => {
      const once = docToText(docFromText(sample));
      expect(docToText(docFromText(once))).toBe(once);
    });
  });
});

describe('positions', () => {
  const doc = docFromText('abc\nde');

  it('clamps places that are out of range and never throws', () => {
    expect(clampPosition(doc, { line: 9, offset: 9 })).toEqual({ line: 1, offset: 2 });
    expect(clampPosition(doc, { line: -1, offset: -1 })).toEqual({ line: 0, offset: 0 });
    expect(clampPosition(doc, { line: 0, offset: 99 })).toEqual({ line: 0, offset: 3 });
    expect(clampPosition(doc, { line: Number.NaN, offset: Number.NaN })).toEqual({ line: 0, offset: 0 });
    expect(clampPosition(doc, { line: Number.POSITIVE_INFINITY, offset: Number.POSITIVE_INFINITY })).toEqual({ line: 1, offset: 2 });
    expect(clampPosition([], { line: 3, offset: 3 })).toEqual({ line: 0, offset: 0 });
  });

  it('compares places', () => {
    expect(comparePositions({ line: 0, offset: 5 }, { line: 1, offset: 0 })).toBeLessThan(0);
    expect(comparePositions({ line: 1, offset: 2 }, { line: 1, offset: 1 })).toBeGreaterThan(0);
    expect(comparePositions({ line: 1, offset: 1 }, { line: 1, offset: 1 })).toBe(0);
  });

  it('puts a selection in order, also when it was made backwards', () => {
    expect(rangeOf(doc, { anchor: { line: 1, offset: 1 }, focus: { line: 0, offset: 2 } })).toEqual({
      start: { line: 0, offset: 2 },
      end: { line: 1, offset: 1 },
    });
  });

  it('turns a place into a number of the flat text and back', () => {
    expect(flatText(doc)).toBe('abc\nde');
    expect(positionToFlat(doc, { line: 0, offset: 0 })).toBe(0);
    expect(positionToFlat(doc, { line: 1, offset: 0 })).toBe(4);
    expect(positionToFlat(doc, { line: 1, offset: 1 })).toBe(5);
    expect(flatToPosition(doc, 3)).toEqual({ line: 0, offset: 3 });
    expect(flatToPosition(doc, 4)).toEqual({ line: 1, offset: 0 });
    expect(flatToPosition(doc, 5)).toEqual({ line: 1, offset: 1 });
    for (let index = 0; index <= 6; index++) {
      expect(positionToFlat(doc, flatToPosition(doc, index))).toBe(index);
    }
  });

  it('clamps flat numbers that are too small or too big', () => {
    expect(flatToPosition(doc, 100)).toEqual({ line: 1, offset: 2 });
    expect(flatToPosition(doc, -5)).toEqual({ line: 0, offset: 0 });
    expect(flatToPosition(doc, Number.NaN)).toEqual({ line: 0, offset: 0 });
  });
});

describe('runs', () => {
  it('slices runs by character and keeps their style', () => {
    const runs = [run('abc', { bold: true }), run('def')];
    expect(sliceRuns(runs, 1, 5)).toEqual([run('bc', { bold: true }), run('de')]);
    expect(sliceRuns(runs, 4, 4)).toEqual([]);
    expect(sliceRuns(runs, 5, 2)).toEqual([]);
  });

  it('merges neighbours that look the same, drops empty runs and does not change its input', () => {
    const runs = [run('a'), run(''), run('b'), run('c', { bold: true })];
    const before = JSON.stringify(runs);
    expect(mergeRuns(runs)).toEqual([run('ab'), run('c', { bold: true })]);
    expect(JSON.stringify(runs)).toBe(before);
  });
});
