import { emptyDoc, type DocPosition, type DocSelection, type RichDoc } from '../../core/admin/richDoc';
import type { Run } from '../../core/content/inline';
import { paragraphBoxClass, spanClassNames } from '../../core/content/richClasses';

// The DOM side of the Admin text box (P10 T11m). The box draws its own lines (React only renders the empty contentEditable div), so
// nothing can fight over the nodes. Every line is a `div.np-richbox__line` directly inside the root; inside it, runs are plain text
// nodes or wrapped in mark elements (strong, em, u, mark) and a span for colour / font / size / word box.
// A position is `{line, offset}` with `offset` in UTF-16 units of the TEXT of that line (the unit of DOM selection offsets).

const TEXT_NODE = 3;
const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT

function isText(node: Node): node is Text {
  return node.nodeType === TEXT_NODE;
}

function lineElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function runNode(owner: Document, run: Run): Node {
  const tags = [run.highlight ? 'mark' : '', run.underline ? 'u' : '', run.italic ? 'em' : '', run.bold ? 'strong' : ''].filter(
    (tag) => tag !== '',
  );
  let node: Node = owner.createTextNode(run.text);
  for (const tag of tags) {
    const element = owner.createElement(tag);
    element.appendChild(node);
    node = element;
  }
  const classes = spanClassNames(run);
  if (classes.length === 0) return node;
  const span = owner.createElement('span');
  span.className = classes.join(' ');
  span.appendChild(node);
  return span;
}

/** Draws the doc: one div per line (an empty line holds a `br` so it keeps its height and can hold the caret). */
export function renderDoc(root: HTMLElement, doc: RichDoc): void {
  const owner = root.ownerDocument;
  const lines = doc.length === 0 ? emptyDoc() : doc;
  const nodes = lines.map((line) => {
    const element = owner.createElement('div');
    element.className = line.box === undefined ? 'np-richbox__line' : `np-richbox__line ${paragraphBoxClass(line.box)}`;
    if (line.bullet) element.setAttribute('data-bullet', 'true');
    if (line.runs.length === 0) element.appendChild(owner.createElement('br'));
    else for (const run of line.runs) element.appendChild(runNode(owner, run));
    return element;
  });
  root.replaceChildren(...nodes);
}

/** The text of every child of the root, line by line (what the browser holds now). */
export function readLineTexts(root: HTMLElement): string[] {
  return Array.from(root.childNodes, (child) => child.textContent ?? '');
}

/** A DOM point (node + offset) as a position in the doc, or null when the point is not inside the root. */
export function positionFromPoint(root: HTMLElement, node: Node, offset: number): DocPosition | null {
  const lines = lineElements(root);
  const last = lines.length - 1;
  const lastLine = lines[last];
  if (lastLine === undefined) return null;

  if (node === root) {
    if (offset >= lines.length) return { line: last, offset: (lastLine.textContent ?? '').length };
    return { line: Math.max(offset, 0), offset: 0 };
  }

  let element: Node | null = node;
  while (element !== null && element.parentNode !== root) element = element.parentNode;
  if (element === null) return null;
  const found = element;
  const index = lines.findIndex((item) => item === found);
  if (index < 0) return null;

  const range = root.ownerDocument.createRange();
  range.setStart(found, 0);
  range.setEnd(node, offset);
  return { line: index, offset: range.toString().length };
}

function pointOf(root: HTMLElement, position: DocPosition): { node: Node; offset: number } | null {
  const lines = lineElements(root);
  const line = lines[Math.min(Math.max(position.line, 0), lines.length - 1)];
  if (line === undefined) return null;

  let remaining = Math.max(position.offset, 0);
  let lastText: Text | null = null;
  const walker = root.ownerDocument.createTreeWalker(line, SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!isText(node)) continue;
    lastText = node;
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  if (lastText !== null) return { node: lastText, offset: lastText.data.length };
  return { node: line, offset: 0 };
}

/** The selection of the page as a doc selection, or null when it is not inside the root. */
export function readSelection(root: HTMLElement): DocSelection | null {
  const dom = root.ownerDocument.getSelection();
  if (dom === null || dom.anchorNode === null || dom.focusNode === null) return null;
  if (!root.contains(dom.anchorNode) || !root.contains(dom.focusNode)) return null;
  const anchor = positionFromPoint(root, dom.anchorNode, dom.anchorOffset);
  const focus = positionFromPoint(root, dom.focusNode, dom.focusOffset);
  return anchor === null || focus === null ? null : { anchor, focus };
}

/** Puts the selection of the page on the doc selection. Does nothing when a point cannot be found. */
export function writeSelection(root: HTMLElement, selection: DocSelection): void {
  const dom = root.ownerDocument.getSelection();
  const anchor = pointOf(root, selection.anchor);
  const focus = pointOf(root, selection.focus);
  if (dom === null || anchor === null || focus === null) return;
  dom.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}

export function sameSelection(a: DocSelection, b: DocSelection): boolean {
  return (
    a.anchor.line === b.anchor.line &&
    a.anchor.offset === b.anchor.offset &&
    a.focus.line === b.focus.line &&
    a.focus.offset === b.focus.offset
  );
}
