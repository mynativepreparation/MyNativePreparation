import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { caretAt, docFromText, emptyDoc, enter, lineText, toggleBullet, toggleMark, type DocSelection, type RichDoc } from '../../core/admin/richDoc';
import { RichBox } from './RichBox';
import { readSelection, writeSelection } from './richBoxDom';

// The Admin text box in jsdom (P10 T11m). jsdom has no keyboard and no IME, so the events are sent by hand: `beforeinput` with an
// `inputType` (what a browser sends for a key press), `input` + `compositionstart` / `compositionend` (what an IME sends), `paste`.

const texts = (doc: RichDoc): string[] => doc.map((line) => lineText(line));

function mount(initial: RichDoc, options: { singleLine?: boolean; disabled?: boolean } = {}) {
  const docs: RichDoc[] = [];
  const reports: DocSelection[] = [];
  const history: string[] = [];

  function Harness() {
    const [state, setState] = useState<{ doc: RichDoc; selection: DocSelection | null }>({ doc: initial, selection: null });
    return (
      <RichBox
        label="Box"
        placeholder="Type here"
        value={state.doc}
        selection={state.selection}
        singleLine={options.singleLine ?? false}
        disabled={options.disabled ?? false}
        onChange={(doc, selection) => {
          docs.push(doc);
          setState({ doc, selection });
        }}
        onSelectionChange={(selection) => {
          reports.push(selection);
          setState((previous) => ({ ...previous, selection }));
        }}
        onUndo={() => history.push('undo')}
        onRedo={() => history.push('redo')}
      />
    );
  }

  render(<Harness />);
  return { docs, reports, history, root: screen.getByRole('textbox', { name: 'Box' }) };
}

/** Focuses the box and puts the page selection on a doc selection. */
function select(root: HTMLElement, line: number, offset: number, endLine = line, endOffset = offset) {
  root.focus();
  writeSelection(root, { anchor: { line, offset }, focus: { line: endLine, offset: endOffset } });
}

function beforeInput(root: HTMLElement, inputType: string, data: string | null = null) {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  fireEvent(root, event);
  return event;
}

function paste(root: HTMLElement, text: string) {
  const event = createEvent.paste(root);
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  fireEvent(root, event);
  return event;
}

const lastTexts = (docs: RichDoc[]): string[][] => docs.slice(-1).map(texts);

describe('RichBox: what it shows', () => {
  it('is a labelled text box and shows the placeholder only while it is empty', () => {
    const { root } = mount(emptyDoc());
    expect(root.getAttribute('contenteditable')).toBe('true');
    expect(root.getAttribute('aria-multiline')).toBe('true');
    expect(root.getAttribute('data-placeholder')).toBe('Type here');
    expect(root.getAttribute('data-empty')).toBe('true');

    select(root, 0, 0);
    beforeInput(root, 'insertText', 'a');
    expect(root.getAttribute('data-empty')).toBe('false');
  });

  it('draws lines, marks and bullets from the doc', () => {
    const range: DocSelection = { anchor: { line: 0, offset: 0 }, focus: { line: 0, offset: 2 } };
    const styled = toggleBullet(toggleMark(docFromText('ab'), range, 'bold'), caretAt({ line: 0, offset: 0 }));
    const { root } = mount(enter(styled, caretAt({ line: 0, offset: 2 })).doc);
    expect(Array.from(root.querySelectorAll('strong')).map((item) => item.textContent)).toEqual(['ab']);
    expect(root.querySelectorAll('[data-bullet="true"]').length).toBeGreaterThan(0);
    expect(root.children.length).toBe(2);
  });

  it('a single line box says so', () => {
    const { root } = mount(docFromText('x'), { singleLine: true });
    expect(root.getAttribute('aria-multiline')).toBe('false');
  });
});

describe('RichBox: typing', () => {
  it('is done by the engine: the browser edit is cancelled, the caret and the text are right', () => {
    const { docs, root } = mount(docFromText('ab'));
    select(root, 0, 1);
    const event = beforeInput(root, 'insertText', 'X');
    expect(event.defaultPrevented).toBe(true);
    expect(lastTexts(docs)).toEqual([['aXb']]);
    expect(root.textContent).toBe('aXb');
    expect(readSelection(root)).toEqual(caretAt({ line: 0, offset: 2 }));
  });

  it('Enter splits the line', () => {
    const multi = mount(docFromText('abcd'));
    select(multi.root, 0, 2);
    beforeInput(multi.root, 'insertParagraph');
    expect(lastTexts(multi.docs)).toEqual([['ab', 'cd']]);
    expect(multi.root.children.length).toBe(2);
  });

  it('Enter does nothing in a single line box', () => {
    const single = mount(docFromText('abcd'), { singleLine: true });
    select(single.root, 0, 2);
    const event = beforeInput(single.root, 'insertParagraph');
    expect(event.defaultPrevented).toBe(true);
    expect(single.docs).toEqual([]);
  });

  it('Backspace at the start of the second line joins the lines', () => {
    const { docs, root } = mount(enter(docFromText('abcd'), caretAt({ line: 0, offset: 2 })).doc);
    select(root, 1, 0);
    beforeInput(root, 'deleteContentBackward');
    expect(lastTexts(docs)).toEqual([['abcd']]);
    expect(readSelection(root)).toEqual(caretAt({ line: 0, offset: 2 }));
  });

  it('Ctrl+B toggles bold on the selection', () => {
    const { root } = mount(docFromText('ab'));
    select(root, 0, 0, 0, 2);
    beforeInput(root, 'formatBold');
    expect(Array.from(root.querySelectorAll('strong')).map((item) => item.textContent)).toEqual(['ab']);
  });

  it('undo and redo are handed to the parent and change nothing here', () => {
    const { docs, history, root } = mount(docFromText('ab'));
    select(root, 0, 1);
    expect(beforeInput(root, 'historyUndo').defaultPrevented).toBe(true);
    beforeInput(root, 'historyRedo');
    expect(history).toEqual(['undo', 'redo']);
    expect(docs).toEqual([]);
  });

  it('does nothing while disabled', () => {
    const { docs, root } = mount(docFromText('ab'), { disabled: true });
    expect(root.getAttribute('contenteditable')).toBe('false');
    beforeInput(root, 'insertText', 'X');
    paste(root, 'Y');
    expect(docs).toEqual([]);
    expect(root.textContent).toBe('ab');
  });
});

describe('RichBox: paste', () => {
  it('pastes plain text only and cancels the browser paste', () => {
    const { docs, root } = mount(docFromText('ab'));
    select(root, 0, 1);
    const event = paste(root, 'X\nY');
    expect(event.defaultPrevented).toBe(true);
    expect(lastTexts(docs)).toEqual([['aX', 'Yb']]);
  });

  it('in a single line box the line break becomes a space', () => {
    const { docs, root } = mount(docFromText('ab'), { singleLine: true });
    select(root, 0, 1);
    paste(root, 'X\nY');
    expect(lastTexts(docs)).toEqual([['aX Yb']]);
  });
});

describe('RichBox: IME composition', () => {
  it('lets the browser edit while composing, reads the text back and draws again at the end', () => {
    const { docs, root } = mount(docFromText('abc'));
    select(root, 0, 3);
    fireEvent.compositionStart(root);

    const event = beforeInput(root, 'insertCompositionText', 'x');
    expect(event.defaultPrevented).toBe(false);
    expect(docs).toEqual([]);

    const textNode = root.firstElementChild?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('the line has no text node');
    textNode.data = 'abc!';
    select(root, 0, 4);
    fireEvent.input(root);
    expect(lastTexts(docs)).toEqual([['abc!']]);

    fireEvent.compositionEnd(root);
    expect(root.textContent).toBe('abc!');
    expect(readSelection(root)).toEqual(caretAt({ line: 0, offset: 4 }));
  });

  it('an edit the browser made by itself (no beforeinput) is read back too', () => {
    const { docs, root } = mount(docFromText('abc'));
    select(root, 0, 3);
    const textNode = root.firstElementChild?.firstChild;
    if (!(textNode instanceof Text)) throw new Error('the line has no text node');
    textNode.data = 'abcd';
    fireEvent.input(root);
    expect(lastTexts(docs)).toEqual([['abcd']]);
    expect(root.textContent).toBe('abcd');
  });
});

describe('RichBox: selection', () => {
  it('reports a moved selection, also across two lines', () => {
    const { reports, root } = mount(enter(docFromText('abcd'), caretAt({ line: 0, offset: 2 })).doc);
    select(root, 0, 1, 1, 1);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(reports.slice(-1)).toEqual([{ anchor: { line: 0, offset: 1 }, focus: { line: 1, offset: 1 } }]);
  });

  it('ignores a selection that is outside the box', () => {
    const { reports, root } = mount(docFromText('abc'));
    select(root, 0, 1);
    const before = reports.length;
    document.body.focus();
    document.getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(reports.length).toBe(before);
  });
});
