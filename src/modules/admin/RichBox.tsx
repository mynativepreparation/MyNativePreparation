import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type DragEvent } from 'react';
import type { DocSelection, RichDoc } from '../../core/admin/richDoc';
import { applyInput, endOf, reconcileText } from './richBoxModel';
import { readLineTexts, readSelection, renderDoc, sameSelection, writeSelection } from './richBoxDom';
import '../../core/content/RichStyles.css';
import './RichBox.css';

// The rich text box of the Admin window (P10 T11m, DECISIONS Q26): a contentEditable div WITHOUT a library.
// - The parent owns the doc and the selection (`value`, `selection`) and gets every change through `onChange`.
// - The box draws its own lines (richBoxDom.renderDoc); React renders only the empty div, so no node is ever fought over.
// - `beforeinput` is cancelled and answered by the engine (richBoxModel.applyInput). Paste is plain text only.
// - IME composition (Gujarati keyboards) is left to the browser; the text is read back from the DOM while composing (`input`) and
//   when it ends (`compositionend`), and only then is the box drawn again.
// - Undo / redo are not done here: the parent keeps the stack (`onUndo` / `onRedo`).
// The box labels itself with `label` and shows `placeholder` while it is empty (CSS, `data-placeholder`).

export interface RichBoxProps {
  value: RichDoc;
  /** The selection the parent knows; the box puts it on the page when the box has focus. `null` = unknown. */
  selection: DocSelection | null;
  onChange: (doc: RichDoc, selection: DocSelection) => void;
  /** The person moved the caret or the selection without changing the text. */
  onSelectionChange?: (selection: DocSelection) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** The accessible name of the box (already translated). */
  label: string;
  placeholder?: string;
  /** Title and Subtitle: one line. */
  singleLine?: boolean;
  disabled?: boolean;
  className?: string;
}

interface Latest {
  value: RichDoc;
  selection: DocSelection | null;
  onChange: RichBoxProps['onChange'];
  onSelectionChange: RichBoxProps['onSelectionChange'];
  onUndo: RichBoxProps['onUndo'];
  onRedo: RichBoxProps['onRedo'];
  singleLine: boolean;
  disabled: boolean;
}

function applyToBox(root: HTMLElement, cur: Latest, inputType: string, data: string | null): void {
  if (cur.disabled) return;
  const selection = readSelection(root) ?? cur.selection ?? endOf(cur.value);
  const outcome = applyInput(cur.value, selection, { inputType, data, singleLine: cur.singleLine });
  if (outcome.kind === 'edit') cur.onChange(outcome.doc, outcome.selection);
  else if (outcome.kind === 'undo') cur.onUndo?.();
  else if (outcome.kind === 'redo') cur.onRedo?.();
}

/** Reads the text back from the DOM (after the browser edited it itself) and tells the parent when the doc changed. */
function syncFromDom(root: HTMLElement, cur: Latest, draw: boolean): void {
  const next = reconcileText(cur.value, readLineTexts(root), cur.singleLine);
  const selection = readSelection(root) ?? cur.selection ?? endOf(next);
  const changed = JSON.stringify(next) !== JSON.stringify(cur.value);
  if (draw) {
    renderDoc(root, changed ? next : cur.value);
    writeSelection(root, selection);
  }
  if (changed) cur.onChange(next, selection);
}

export function RichBox({
  value,
  selection,
  onChange,
  onSelectionChange,
  onUndo,
  onRedo,
  label,
  placeholder = '',
  singleLine = false,
  disabled = false,
  className,
}: RichBoxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const latest = useRef<Latest>({ value, selection, onChange, onSelectionChange, onUndo, onRedo, singleLine, disabled });

  useLayoutEffect(() => {
    latest.current = { value, selection, onChange, onSelectionChange, onUndo, onRedo, singleLine, disabled };
  });

  // Draw the lines whenever the doc changes (not while the browser is composing text: that would destroy the composition).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || composing.current) return;
    renderDoc(root, value);
  }, [value]);

  // Put the parent's selection on the page, but only into a box that has focus and only when the page says something else.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || composing.current || selection === null) return;
    if (root.ownerDocument.activeElement !== root) return;
    const current = readSelection(root);
    if (current === null || !sameSelection(current, selection)) writeSelection(root, selection);
  }, [value, selection]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const owner = root.ownerDocument;

    const onBeforeInput = (event: InputEvent): void => {
      if (composing.current || event.isComposing || event.inputType === 'insertCompositionText') return;
      event.preventDefault();
      applyToBox(root, latest.current, event.inputType, event.data);
    };
    const onPageSelection = (): void => {
      if (composing.current) return;
      const cur = latest.current;
      if (cur.onSelectionChange === undefined) return;
      const now = readSelection(root);
      if (now === null) return;
      if (cur.selection !== null && sameSelection(now, cur.selection)) return;
      cur.onSelectionChange(now);
    };

    root.addEventListener('beforeinput', onBeforeInput);
    owner.addEventListener('selectionchange', onPageSelection);
    return () => {
      root.removeEventListener('beforeinput', onBeforeInput);
      owner.removeEventListener('selectionchange', onPageSelection);
    };
  }, []);

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const root = rootRef.current;
    if (root === null) return;
    applyToBox(root, latest.current, 'insertFromPaste', event.clipboardData.getData('text/plain'));
  }

  function handleInput() {
    const root = rootRef.current;
    if (root === null || latest.current.disabled) return;
    syncFromDom(root, latest.current, !composing.current);
  }

  function handleCompositionEnd() {
    composing.current = false;
    const root = rootRef.current;
    if (root === null || latest.current.disabled) return;
    syncFromDom(root, latest.current, true);
  }

  const isEmpty = value.every((line) => line.runs.length === 0 && !line.bullet);
  const classes = ['np-richbox', singleLine ? 'np-richbox--single' : '', className ?? ''].filter((name) => name !== '');

  return (
    <div
      ref={rootRef}
      className={classes.join(' ')}
      contentEditable={!disabled}
      role="textbox"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-multiline={!singleLine}
      aria-disabled={disabled}
      data-empty={isEmpty ? 'true' : 'false'}
      data-placeholder={placeholder}
      onPaste={handlePaste}
      onInput={handleInput}
      onDrop={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={handleCompositionEnd}
    />
  );
}
