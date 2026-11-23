import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichParagraph } from './RichText';

function draw(text: string): HTMLElement {
  const { container } = render(
    <div>
      <RichParagraph text={text} />
    </div>,
  );
  return container.firstElementChild as HTMLElement;
}

describe('RichParagraph: plain text', () => {
  it('is one <p> with the text and no wrapper elements', () => {
    const root = draw('Just a sentence.');
    expect(root.children).toHaveLength(1);
    const p = root.firstElementChild as HTMLElement;
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe('Just a sentence.');
    expect(p.children).toHaveLength(0); // a plain text node only
  });

  it('keeps single line breaks inside ONE paragraph', () => {
    const root = draw('One\nstill one');
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('p')?.textContent).toBe('One\nstill one');
  });

  it('draws nothing for empty or blank text', () => {
    expect(draw('').children).toHaveLength(0);
    expect(draw('   \n  ').children).toHaveLength(0);
  });
});

describe('RichParagraph: marks', () => {
  it.each([
    ['**bold**', 'strong'],
    ['*italic*', 'em'],
    ['__underline__', 'u'],
    ['==highlight==', 'mark'],
  ])('%s becomes <%s>', (text, tag) => {
    const root = draw(`before ${text} after`);
    const marked = root.querySelectorAll(tag);
    expect(marked).toHaveLength(1);
    expect(root.querySelector('p')?.textContent).toBe(`before ${text.replace(/[*_=]/g, '')} after`);
  });

  it('the highlight carries the np-mark class used by the stylesheet', () => {
    expect(draw('==x==').querySelector('mark')).toHaveClass('np-mark');
  });

  it('combines marks: ***both*** is bold and italic around the same text', () => {
    const root = draw('***both***');
    const strong = root.querySelector('strong');
    expect(strong?.querySelector('em')?.textContent).toBe('both');
  });

  it('keeps spaces around marks', () => {
    expect(draw('a **b** c').querySelector('p')?.textContent).toBe('a b c');
  });

  it('works with Gujarati text', () => {
    const root = draw('આ **મહત્વપૂર્ણ** વાક્ય છે');
    expect(root.querySelector('strong')?.textContent).toBe('મહત્વપૂર્ણ');
    expect(root.querySelector('p')?.textContent).toBe('આ મહત્વપૂર્ણ વાક્ય છે');
  });

  it('leaves an unclosed mark as plain text', () => {
    const root = draw('**not closed');
    expect(root.querySelector('strong')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('**not closed');
  });

  it('leaves "2 * 3 * 4" alone', () => {
    const root = draw('2 * 3 * 4');
    expect(root.querySelector('em')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('2 * 3 * 4');
  });

  it('shows an escaped mark character as plain text', () => {
    const root = draw('\\*not italic\\*');
    expect(root.querySelector('em')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('*not italic*');
  });

  it('never turns text into HTML', () => {
    const root = draw('**<b>x</b><script>alert(1)</script>**');
    expect(root.querySelector('b, script')).toBeNull();
    expect(root.querySelector('strong')?.textContent).toBe('<b>x</b><script>alert(1)</script>');
  });
});

describe('RichParagraph: bullets', () => {
  it('makes a list out of consecutive "- " lines', () => {
    const root = draw('- one\n- two\n- three');
    expect(root.querySelectorAll('p')).toHaveLength(0);
    const items = Array.from(root.querySelectorAll('ul > li')).map((li) => li.textContent);
    expect(items).toEqual(['one', 'two', 'three']);
  });

  it('keeps the order of text, list and text', () => {
    const root = draw('Intro\n- one\n- two\nOutro');
    expect(Array.from(root.children).map((c) => c.tagName)).toEqual(['P', 'UL', 'P']);
    expect(root.querySelectorAll('li')).toHaveLength(2);
  });

  it('allows marks inside a bullet', () => {
    const root = draw('- a **strong** item');
    expect(root.querySelector('li strong')?.textContent).toBe('strong');
  });

  it('a hyphen inside a line is not a bullet', () => {
    const root = draw('well-known - not a list');
    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelector('p')?.textContent).toBe('well-known - not a list');
  });
});

describe('RichParagraph: never throws', () => {
  it.each(['*', '**', '***', '****', '_', '__', '==', '=== ===', '\\', '\\\\', '- ', '-', '**a*b**c*', '＊＊', '\u0000'])(
    'draws %j without an error',
    (text) => {
      expect(() => draw(text)).not.toThrow();
    },
  );
});
