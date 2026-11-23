import { useCallback, useMemo, useRef, useState } from 'react';
import { docToText, type DocSelection, type RichDoc } from '../../core/admin/richDoc';
import { endOf } from './richBoxModel';

// State of ONE rich box of the Admin window (P10 T11n step A): the doc, the selection and an undo / redo stack.
// Wire it to the box like this:
//   const r = useRichDoc(docFromText(saved));
//   <RichBox value={r.doc} selection={r.selection} onChange={r.change} onSelectionChange={r.select} onUndo={r.undo} onRedo={r.redo} />
// Toolbar buttons call `r.apply((doc, selection) => toggleMark(...))`: every toolbar action is its own undo step.
// Typing is merged: keys that follow each other within `mergeMs` are ONE step; a caret move or a toolbar action ends the typing step.
// All handlers are stable (they never change between renders) and read the newest state from a ref, so two calls in the same tick
// (for example `change` and then `select` from one browser event) never work on stale state.

/** The undo stack keeps at most this many steps; the oldest are dropped. */
export const MAX_UNDO_STEPS = 100;
/** Typing that continues within this many milliseconds of the previous key stays in the same undo step. */
export const DEFAULT_MERGE_MS = 1000;

export interface RichDocOptions {
  /** Clock in milliseconds. Tests pass a fake one. Read once, at the first render. */
  now?: () => number;
  /** See DEFAULT_MERGE_MS. Read once, at the first render. */
  mergeMs?: number;
}

export interface RichDocController {
  doc: RichDoc;
  /** `null` until the box tells where the caret is. */
  selection: DocSelection | null;
  /** The stored text form of the doc (marks and brace spans), ready to be saved. */
  text: string;
  canUndo: boolean;
  canRedo: boolean;
  /** For `RichBox` `onChange`: the person typed, pasted or deleted. */
  change: (doc: RichDoc, selection: DocSelection) => void;
  /** For `RichBox` `onSelectionChange`: the caret or the selection moved. */
  select: (selection: DocSelection) => void;
  /** Toolbar action: `edit` gets the current doc and selection (a caret at the end when none is known) and returns the new doc. */
  apply: (edit: (doc: RichDoc, selection: DocSelection) => RichDoc) => void;
  undo: () => void;
  redo: () => void;
  /** Replaces the doc (for example when another chapter is opened) and forgets the whole history. */
  reset: (doc: RichDoc) => void;
}

interface Snapshot {
  doc: RichDoc;
  selection: DocSelection | null;
}

interface State extends Snapshot {
  /** Oldest first. */
  past: Snapshot[];
  /** The step to redo next is the LAST one. */
  future: Snapshot[];
  /** True while consecutive typing may still be merged into the newest step. */
  typing: boolean;
  /** Clock value of the last typing change. */
  typedAt: number;
}

function freshState(doc: RichDoc): State {
  return { doc, selection: null, past: [], future: [], typing: false, typedAt: 0 };
}

function snapshotOf(state: State): Snapshot {
  return { doc: state.doc, selection: state.selection };
}

function pushStep(past: Snapshot[], step: Snapshot): Snapshot[] {
  return [...past, step].slice(-MAX_UNDO_STEPS);
}

function last(steps: readonly Snapshot[]): Snapshot | undefined {
  return steps.length === 0 ? undefined : steps[steps.length - 1];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useRichDoc(initial: RichDoc | (() => RichDoc), options: RichDocOptions = {}): RichDocController {
  const [state, setState] = useState<State>(() => freshState(typeof initial === 'function' ? initial() : initial));
  const live = useRef(state);
  const config = useRef({ now: options.now ?? (() => Date.now()), mergeMs: options.mergeMs ?? DEFAULT_MERGE_MS });

  const commit = useCallback((next: State) => {
    live.current = next;
    setState(next);
  }, []);

  const select = useCallback(
    (selection: DocSelection) => {
      const cur = live.current;
      // The browser echoes the selection that a change just set: that is not a caret move.
      if (sameJson(selection, cur.selection)) return;
      commit({ ...cur, selection, typing: false });
    },
    [commit],
  );

  const change = useCallback(
    (doc: RichDoc, selection: DocSelection) => {
      const cur = live.current;
      if (sameJson(doc, cur.doc)) {
        select(selection);
        return;
      }
      const at = config.current.now();
      const merge = cur.typing && at - cur.typedAt <= config.current.mergeMs;
      commit({
        doc,
        selection,
        past: merge ? cur.past : pushStep(cur.past, snapshotOf(cur)),
        future: [],
        typing: true,
        typedAt: at,
      });
    },
    [commit, select],
  );

  const apply = useCallback(
    (edit: (doc: RichDoc, selection: DocSelection) => RichDoc) => {
      const cur = live.current;
      const next = edit(cur.doc, cur.selection ?? endOf(cur.doc));
      if (sameJson(next, cur.doc)) return;
      commit({ ...cur, doc: next, past: pushStep(cur.past, snapshotOf(cur)), future: [], typing: false });
    },
    [commit],
  );

  const undo = useCallback(() => {
    const cur = live.current;
    const step = last(cur.past);
    if (step === undefined) return;
    commit({
      doc: step.doc,
      selection: step.selection,
      past: cur.past.slice(0, -1),
      future: [...cur.future, snapshotOf(cur)],
      typing: false,
      typedAt: 0,
    });
  }, [commit]);

  const redo = useCallback(() => {
    const cur = live.current;
    const step = last(cur.future);
    if (step === undefined) return;
    commit({
      doc: step.doc,
      selection: step.selection,
      past: pushStep(cur.past, snapshotOf(cur)),
      future: cur.future.slice(0, -1),
      typing: false,
      typedAt: 0,
    });
  }, [commit]);

  const reset = useCallback((doc: RichDoc) => commit(freshState(doc)), [commit]);

  const text = useMemo(() => docToText(state.doc), [state.doc]);

  return {
    doc: state.doc,
    selection: state.selection,
    text,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    change,
    select,
    apply,
    undo,
    redo,
    reset,
  };
}
