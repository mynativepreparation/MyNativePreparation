import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { docFromText, type DocSelection } from '../../core/admin/richDoc';
import { endOf } from './richBoxModel';
import { DEFAULT_MERGE_MS, MAX_UNDO_STEPS, useRichDoc } from './useRichDoc';

// The hook is tested with a fake clock, so "typing within one second" does not depend on real time.
let clock = 0;

const caret = (line: number, offset: number): DocSelection => ({ anchor: { line, offset }, focus: { line, offset } });

function setup(initial = 'a') {
  clock = 0;
  return renderHook(() => useRichDoc(docFromText(initial), { now: () => clock }));
}

type Hook = ReturnType<typeof setup>;

/** One typing change at clock time `at` (milliseconds); the caret goes to `offset` in line 0. */
function typeText(hook: Hook, text: string, offset: number, at: number): void {
  clock = at;
  act(() => {
    hook.result.current.change(docFromText(text), caret(0, offset));
  });
}

function undo(hook: Hook): void {
  act(() => {
    hook.result.current.undo();
  });
}

function redo(hook: Hook): void {
  act(() => {
    hook.result.current.redo();
  });
}

describe('useRichDoc: state', () => {
  it('starts with the initial doc, its text and nothing to undo or redo', () => {
    const hook = setup('a');
    expect(hook.result.current.doc).toEqual(docFromText('a'));
    expect(hook.result.current.text).toBe('a');
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it('accepts a function for the initial doc and calls it only once', () => {
    const make = vi.fn(() => docFromText('x'));
    const hook = renderHook(() => useRichDoc(make));
    hook.rerender();
    expect(make).toHaveBeenCalledTimes(1);
    expect(hook.result.current.text).toBe('x');
  });

  it('change stores the new doc, the selection and the text', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    expect(hook.result.current.text).toBe('ab');
    expect(hook.result.current.selection).toEqual(caret(0, 2));
    expect(hook.result.current.canUndo).toBe(true);
  });

  it('a change with the same doc only moves the caret (no undo step)', () => {
    const hook = setup('a');
    typeText(hook, 'a', 1, 0);
    expect(hook.result.current.selection).toEqual(caret(0, 1));
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('select stores a caret move without an undo step', () => {
    const hook = setup('a');
    act(() => {
      hook.result.current.select(caret(0, 1));
    });
    expect(hook.result.current.selection).toEqual(caret(0, 1));
    expect(hook.result.current.canUndo).toBe(false);
  });
});

describe('useRichDoc: undo and redo of typing', () => {
  it('typing within the merge time is ONE undo step', () => {
    const hook = setup('a');
    expect(DEFAULT_MERGE_MS).toBe(1000);
    typeText(hook, 'ab', 2, 0);
    typeText(hook, 'abc', 3, 500);
    typeText(hook, 'abcd', 4, 1400); // 900 ms after the previous key: still the same step
    expect(hook.result.current.text).toBe('abcd');

    undo(hook);
    expect(hook.result.current.text).toBe('a');
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);

    redo(hook);
    expect(hook.result.current.text).toBe('abcd');
    expect(hook.result.current.canRedo).toBe(false);
  });

  it('a pause longer than the merge time starts a new step', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    typeText(hook, 'abc', 3, 2000);
    undo(hook);
    expect(hook.result.current.text).toBe('ab');
    undo(hook);
    expect(hook.result.current.text).toBe('a');
  });

  it('uses the merge time that the caller gives', () => {
    clock = 0;
    const hook = renderHook(() => useRichDoc(docFromText('a'), { now: () => clock, mergeMs: 50 }));
    typeText(hook, 'ab', 2, 0);
    typeText(hook, 'abc', 3, 60);
    undo(hook);
    expect(hook.result.current.text).toBe('ab');
  });

  it('a caret move ends the typing step', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    act(() => {
      hook.result.current.select(caret(0, 0));
    });
    typeText(hook, 'xab', 1, 100);
    undo(hook);
    expect(hook.result.current.text).toBe('ab');
    undo(hook);
    expect(hook.result.current.text).toBe('a');
  });

  it('the selection that the browser echoes after a change is not a caret move', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    act(() => {
      hook.result.current.select(caret(0, 2)); // same as the change set
    });
    typeText(hook, 'abc', 3, 100);
    undo(hook);
    expect(hook.result.current.text).toBe('a');
  });

  it('a new change after undo forgets the redo steps', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    undo(hook);
    expect(hook.result.current.canRedo).toBe(true);
    typeText(hook, 'ac', 2, 5000);
    expect(hook.result.current.canRedo).toBe(false);
    expect(hook.result.current.text).toBe('ac');
  });

  it('undo and redo bring back the selection of that moment', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    typeText(hook, 'abc', 3, 5000);

    undo(hook);
    expect(hook.result.current.text).toBe('ab');
    expect(hook.result.current.selection).toEqual(caret(0, 2));
    undo(hook);
    expect(hook.result.current.text).toBe('a');
    expect(hook.result.current.selection).toBeNull();

    redo(hook);
    expect(hook.result.current.text).toBe('ab');
    expect(hook.result.current.selection).toEqual(caret(0, 2));
    redo(hook);
    expect(hook.result.current.text).toBe('abc');
    expect(hook.result.current.selection).toEqual(caret(0, 3));
  });

  it('undo and redo with nothing to do change nothing', () => {
    const hook = setup('a');
    undo(hook);
    redo(hook);
    expect(hook.result.current.text).toBe('a');
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });
});

describe('useRichDoc: apply (toolbar actions)', () => {
  it('every apply is its own step, even right after typing', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    act(() => {
      hook.result.current.apply(() => docFromText('AB'));
    });
    expect(hook.result.current.text).toBe('AB');

    undo(hook);
    expect(hook.result.current.text).toBe('ab');
    undo(hook);
    expect(hook.result.current.text).toBe('a');
  });

  it('two applies in a row are two steps', () => {
    const hook = setup('a');
    act(() => {
      hook.result.current.apply(() => docFromText('b'));
      hook.result.current.apply(() => docFromText('c'));
    });
    expect(hook.result.current.text).toBe('c');
    undo(hook);
    expect(hook.result.current.text).toBe('b');
    undo(hook);
    expect(hook.result.current.text).toBe('a');
  });

  it('ends the typing step: typing after an apply is a new step', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    act(() => {
      hook.result.current.apply(() => docFromText('AB'));
    });
    typeText(hook, 'ABC', 3, 100);
    undo(hook);
    expect(hook.result.current.text).toBe('AB');
  });

  it('gives the edit the current doc and the selection (a caret at the end when none is known)', () => {
    const hook = setup('a');
    const seen: DocSelection[] = [];
    act(() => {
      hook.result.current.apply((doc, selection) => {
        seen.push(selection);
        return doc;
      });
    });
    typeText(hook, 'ab', 1, 0);
    act(() => {
      hook.result.current.apply((doc, selection) => {
        seen.push(selection);
        return doc;
      });
    });
    expect(seen).toEqual([endOf(docFromText('a')), caret(0, 1)]);
  });

  it('an edit that changes nothing adds no step', () => {
    const hook = setup('a');
    act(() => {
      hook.result.current.apply((doc) => doc);
    });
    expect(hook.result.current.canUndo).toBe(false);
    act(() => {
      hook.result.current.apply(() => docFromText('a'));
    });
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('keeps the selection that the box knows', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    act(() => {
      hook.result.current.apply(() => docFromText('AB'));
    });
    expect(hook.result.current.selection).toEqual(caret(0, 2));
  });
});

describe('useRichDoc: reset and limits', () => {
  it('reset replaces the doc and forgets the whole history and the selection', () => {
    const hook = setup('a');
    typeText(hook, 'ab', 2, 0);
    undo(hook);
    act(() => {
      hook.result.current.reset(docFromText('new'));
    });
    expect(hook.result.current.text).toBe('new');
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it('keeps at most 100 undo steps', () => {
    const hook = setup('start');
    act(() => {
      for (let i = 1; i <= MAX_UNDO_STEPS + 5; i += 1) {
        hook.result.current.apply(() => docFromText(`v${i}`));
      }
    });
    expect(MAX_UNDO_STEPS).toBe(100);
    expect(hook.result.current.text).toBe(`v${MAX_UNDO_STEPS + 5}`);

    act(() => {
      for (let i = 0; i < MAX_UNDO_STEPS; i += 1) hook.result.current.undo();
    });
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.text).toBe('v5');
  });

  it('the handlers never change between renders (so RichBox does not re-attach anything)', () => {
    const hook = setup('a');
    const first = hook.result.current;
    typeText(hook, 'ab', 2, 0);
    hook.rerender();
    const now = hook.result.current;
    expect(now.change).toBe(first.change);
    expect(now.select).toBe(first.select);
    expect(now.apply).toBe(first.apply);
    expect(now.undo).toBe(first.undo);
    expect(now.redo).toBe(first.redo);
    expect(now.reset).toBe(first.reset);
  });
});
