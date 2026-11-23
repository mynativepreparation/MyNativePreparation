import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichInline, RichParagraph } from './RichText';

// P10 T11k: the reader draws the brace spans ({c=..;f=..;s=..;x=..|text}) and the paragraph boxes ({{x=..}}).

function draw(text: string): HTMLElement {
  const { container } = render(
    <div>
      <RichParagraph text={text} />
    </div>,
  );
  return container.firstElementChild as HTMLElement;
}

describe('RichParagraph: colour, font and size spans', () => {
  it('draws a colour as one span with the ink class and leaves the text around it alone', () => {
    const root = draw('a {c=red|hot} b');
    const spans = root.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveClass('np-ink-red');
    expect(spans[0].textContent).toBe('hot');
    expect(root.querySelector('p')?.textContent).toBe('a hot b');
  });

  it.each(['red', 'orange', 'brown', 'green', 'teal', 'blue', 'purple', 'pink'])('colour %s gets the class np-ink-%s', (id) => {
    expect(draw(`{c=${id}|x}`).querySelector('span')).toHaveClass(`np-ink-${id}`);
  });

  it.each(['s', 'l', 'xl', 'xxl'])('size %s gets the class np-size-%s', (id) => {
    expect(draw(`{s=${id}|x}`).querySelector('span')).toHaveClass(`np-size-${id}`);
  });

  it.each(['sans', 'serif', 'humanist'])('font %s gets the class np-font-%s', (id) => {
    expect(draw(`{f=${id}|x}`).querySelector('span')).toHaveClass(`np-font-${id}`);
  });

  it('several styles at once are ONE span with all classes', () => {
    const root = draw('{c=blue;f=serif;s=l|together}');
    const spans = root.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveClass('np-ink-blue', 'np-font-serif', 'np-size-l');
    expect(spans[0].textContent).toBe('together');
  });

  it('a span can hold marks: the marks sit inside the style span', () => {
    const root = draw('{c=red|**strong red**}');
    expect(root.querySelector('.np-ink-red > strong')?.textContent).toBe('strong red');
  });

  it('nested spans give inner text the colour of the inner span', () => {
    const root = draw('{c=red|a {c=green|b} c}');
    const spans = Array.from(root.querySelectorAll('span'));
    expect(spans.map((s) => [s.className, s.textContent])).toEqual([
      ['np-ink-red', 'a '],
      ['np-ink-green', 'b'],
      ['np-ink-red', ' c'],
    ]);
  });

  it('an unknown id is not a style: the text stays as written', () => {
    const root = draw('{c=chartreuse|x}');
    expect(root.querySelector('span')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('{c=chartreuse|x}');
  });

  it('works with Gujarati text', () => {
    const root = draw('આ {c=blue|મહત્વપૂર્ણ} વાક્ય');
    expect(root.querySelector('.np-ink-blue')?.textContent).toBe('મહત્વપૂર્ણ');
    expect(root.querySelector('p')?.textContent).toBe('આ મહત્વપૂર્ણ વાક્ય');
  });

  it('never writes a colour value itself (classes only, no style attribute)', () => {
    const root = draw('{c=red;s=xl;x=w-box-dark|x} {x=l-circle-dark|y}');
    expect(root.querySelector('[style]')).toBeNull();
  });
});

describe('RichParagraph: boxes around selected words', () => {
  it('draws one box around the whole selection', () => {
    const root = draw('see {x=w-pill-dark|these two words} now');
    const box = root.querySelector('.np-wbox');
    expect(box).toHaveClass('np-wbox', 'np-wbox-pill-dark');
    expect(box?.textContent).toBe('these two words');
    expect(root.querySelectorAll('.np-lbox')).toHaveLength(0);
  });

  it.each(['w-box-light', 'w-box-dark', 'w-pill-light', 'w-pill-dark', 'w-dashed', 'w-double', 'w-underline'])(
    'word box %s becomes the class np-wbox-%s',
    (id) => {
      expect(draw(`{x=${id}|x}`).querySelector('.np-wbox')).toHaveClass(`np-wbox-${id.slice(2)}`);
    },
  );

  it('a word box and a colour share one span', () => {
    const root = draw('{c=green;x=w-dashed|x}');
    expect(root.querySelectorAll('span')).toHaveLength(1);
    expect(root.querySelector('span')).toHaveClass('np-ink-green', 'np-wbox', 'np-wbox-dashed');
  });
});

describe('RichParagraph: a box around each letter', () => {
  it('puts a box on every letter and keeps the spaces outside the boxes', () => {
    const root = draw('{x=l-circle-dark|ab c}');
    const letters = Array.from(root.querySelectorAll('.np-lbox'));
    expect(letters.map((l) => l.textContent)).toEqual(['a', 'b', 'c']);
    for (const letter of letters) expect(letter).toHaveClass('np-lbox', 'np-lbox-circle', 'np-lbox-dark');
    expect(root.querySelector('p')?.textContent).toBe('ab c');
  });

  it.each([
    ['l-circle-light', 'np-lbox-circle', 'np-lbox-light'],
    ['l-square-dark', 'np-lbox-square', 'np-lbox-dark'],
    ['l-diamond-light', 'np-lbox-diamond', 'np-lbox-light'],
    ['l-round-dark', 'np-lbox-round', 'np-lbox-dark'],
  ])('%s gets the shape class and the tone class', (id, shape, tone) => {
    expect(draw(`{x=${id}|x}`).querySelector('.np-lbox')).toHaveClass('np-lbox', shape, tone);
  });

  it('keeps a Gujarati letter with its vowel sign inside ONE box', () => {
    const root = draw('{x=l-square-light|ગુજરાતી}');
    const letters = Array.from(root.querySelectorAll('.np-lbox')).map((l) => l.textContent);
    expect(letters).toEqual(['ગુ', 'જ', 'રા', 'તી']);
    expect(root.querySelector('p')?.textContent).toBe('ગુજરાતી');
  });

  it('works together with bold and a colour', () => {
    const root = draw('{c=red;x=l-circle-dark|**ab**}');
    expect(root.querySelectorAll('.np-ink-red > strong > .np-lbox')).toHaveLength(2);
  });
});

describe('RichParagraph: boxes around a whole paragraph', () => {
  it('a boxed line is its own <p> with the box classes', () => {
    const root = draw('{{x=p-dashed}}boxed');
    const p = root.querySelector('p');
    expect(p).toHaveClass('np-pbox', 'np-pbox-dashed');
    expect(p?.textContent).toBe('boxed');
  });

  it.each(['p-box-light', 'p-box-dark', 'p-round', 'p-dashed', 'p-double', 'p-leftbar', 'p-shadow'])(
    'paragraph box %s becomes the class np-pbox-%s',
    (id) => {
      expect(draw(`{{x=${id}}}x`).querySelector('p')).toHaveClass('np-pbox', `np-pbox-${id.slice(2)}`);
    },
  );

  it('normal lines before and after stay outside the box, in their own paragraphs', () => {
    const root = draw('before\n{{x=p-box-dark}}boxed\nafter one\nafter two');
    const paragraphs = Array.from(root.querySelectorAll('p'));
    expect(paragraphs.map((p) => [p.textContent, p.classList.contains('np-pbox')])).toEqual([
      ['before', false],
      ['boxed', true],
      ['after one\nafter two', false],
    ]);
  });

  it('two boxed lines are two boxes', () => {
    const root = draw('{{x=p-round}}one\n{{x=p-round}}two');
    expect(root.querySelectorAll('p.np-pbox-round')).toHaveLength(2);
  });

  it('a box in front of "- " boxes the list, and the next bullets stay in it', () => {
    const root = draw('{{x=p-round}}- a\n- b\nafter');
    const lists = root.querySelectorAll('ul');
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveClass('np-block-list', 'np-pbox', 'np-pbox-round');
    expect(Array.from(lists[0].querySelectorAll('li')).map((li) => li.textContent)).toEqual(['a', 'b']);
    expect(Array.from(root.children).map((c) => c.tagName)).toEqual(['UL', 'P']);
  });

  it('an unknown paragraph box id is plain text', () => {
    const root = draw('{{x=p-nothing}}text');
    expect(root.querySelector('p')).not.toHaveClass('np-pbox');
    expect(root.querySelector('p')?.textContent).toBe('{{x=p-nothing}}text');
  });

  it('spans work inside a boxed line and inside a bullet', () => {
    const root = draw('{{x=p-leftbar}}see {c=teal|this}\n- {s=l|big} item');
    expect(root.querySelector('p.np-pbox-leftbar .np-ink-teal')?.textContent).toBe('this');
    expect(root.querySelector('li .np-size-l')?.textContent).toBe('big');
  });
});

describe('RichInline (titles and subtitles)', () => {
  function drawInline(text: string): HTMLElement {
    const { container } = render(
      <h2>
        <RichInline text={text} />
      </h2>,
    );
    return container.firstElementChild as HTMLElement;
  }

  it('plain text is just a text node', () => {
    const h = drawInline('Plain title');
    expect(h.children).toHaveLength(0);
    expect(h.textContent).toBe('Plain title');
  });

  it('draws marks and spans', () => {
    const h = drawInline('A **bold** and {c=purple;s=xl|big} title');
    expect(h.querySelector('strong')?.textContent).toBe('bold');
    expect(h.querySelector('.np-ink-purple.np-size-xl')?.textContent).toBe('big');
    expect(h.textContent).toBe('A bold and big title');
  });

  it('turns line breaks into spaces', () => {
    expect(drawInline('One\nTwo\r\nThree').textContent).toBe('One Two Three');
  });

  it('keeps a leading "- " and a paragraph prefix as written (a title is never a list or a box)', () => {
    const h = drawInline('- Part one');
    expect(h.querySelector('ul, li')).toBeNull();
    expect(h.textContent).toBe('- Part one');
    expect(drawInline('{{x=p-dashed}}Title').textContent).toBe('{{x=p-dashed}}Title');
  });

  it('draws a letter box inside a title', () => {
    expect(drawInline('{x=l-circle-light|AB}').querySelectorAll('.np-lbox')).toHaveLength(2);
  });
});

describe('RichParagraph: never throws', () => {
  it.each(['{', '}', '{}', '{|}', '{c=red|', '{c=red|}', '{{x=p-dashed}}', '{{x=p-dashed}}- ', '{x=l-circle-dark|}', '{c=red|{c=red|{c=red|a}}}', '\\{c=red|x\\}'])(
    'draws %j without an error',
    (text) => {
      expect(() => draw(text)).not.toThrow();
    },
  );
});
