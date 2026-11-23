import { Fragment, type ReactNode } from 'react';
import { parseInline, parseRichText, type Run } from '../../core/content/inline';
import { isLetterBoxId, type LetterBoxId, type ParagraphBoxId } from '../../core/content/richStyles';
import { isBlankLetter, splitLetters } from './letters';
import { letterBoxClass, paragraphBoxClass, spanClassNames } from './richClasses';
import './RichStyles.css';

// Text formatting for the reader (P10 T11b + T11k, DECISIONS Q25 + Q26): **bold**, *italic*, __underline__, ==highlight==, "- " bullets,
// and the brace spans (colour, font, size, boxes). Built only from React elements, so no text is ever turned into HTML.
// The parsing itself is core/content/inline.ts (pure, never throws).

type Piece =
  | { kind: 'p'; lines: Run[][]; box?: ParagraphBoxId }
  | { kind: 'ul'; items: Run[][]; box?: ParagraphBoxId };

/**
 * One paragraph (already split on blank lines) -> paragraphs and bullet lists.
 * Consecutive normal lines stay together in ONE <p> (single line breaks are kept, as before); consecutive "- " lines make one list.
 * A line with a paragraph box always starts its own piece, and no normal line is added to a boxed <p> (the box wraps exactly that line).
 * Bullets that follow a boxed list stay in that list (the same rule as parseRichText in core/content/inline.ts).
 */
function piecesOf(paragraph: string): Piece[] {
  const pieces: Piece[] = [];
  for (const line of paragraph.split('\n')) {
    const parsed = parseRichText(line);
    if (parsed.length === 0) continue;
    const first = parsed[0];
    const last = pieces.length > 0 ? pieces[pieces.length - 1] : undefined;
    if (first.type === 'paragraph') {
      if (first.box === undefined && last !== undefined && last.kind === 'p' && last.box === undefined) {
        last.lines.push(first.runs);
      } else {
        pieces.push(first.box === undefined ? { kind: 'p', lines: [first.runs] } : { kind: 'p', lines: [first.runs], box: first.box });
      }
    } else if (first.box === undefined && last !== undefined && last.kind === 'ul') {
      last.items.push(...first.items); // like parseRichText: bullets after a boxed list stay inside the same box
    } else {
      pieces.push(
        first.box === undefined ? { kind: 'ul', items: [...first.items] } : { kind: 'ul', items: [...first.items], box: first.box },
      );
    }
  }
  return pieces;
}

/** The text of a run with a box around EACH letter. Spaces and line breaks stay outside the boxes. */
function Letters({ text, box }: { text: string; box: LetterBoxId }) {
  const className = letterBoxClass(box);
  return (
    <>
      {splitLetters(text).map((letter, index) =>
        isBlankLetter(letter) ? (
          <Fragment key={index}>{letter}</Fragment>
        ) : (
          <span key={index} className={className}>
            {letter}
          </span>
        ),
      )}
    </>
  );
}

/**
 * A run with its look: marks strong > em > u > mark, inside one span for colour / font / size / word box.
 * A run without any style is plain text (no wrapper element).
 */
function decorate(run: Run): ReactNode {
  let node: ReactNode = run.box !== undefined && isLetterBoxId(run.box) ? <Letters text={run.text} box={run.box} /> : run.text;
  if (run.highlight) node = <mark className="np-mark">{node}</mark>;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  const names = spanClassNames(run);
  if (names.length > 0) node = <span className={names.join(' ')}>{node}</span>;
  return node;
}

function RunsView({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((run, index) => (
        <Fragment key={index}>{decorate(run)}</Fragment>
      ))}
    </>
  );
}

/**
 * ONE line of text with the same marks and spans, for titles and subtitles (a fragment: the heading element stays the caller's).
 * Line breaks become spaces. A leading "- " or "{{x=...}}" is NOT treated as a bullet or a paragraph box here: titles stay as written.
 */
export function RichInline({ text }: { text: string }) {
  return <RunsView runs={parseInline(text.replace(/\s*\r?\n\s*/g, ' '))} />;
}

/**
 * Draws one blank-line-separated paragraph of a text block as <p> and <ul> elements (a fragment: the parent decides the layout).
 * Empty or whitespace-only text draws nothing.
 */
export function RichParagraph({ text }: { text: string }) {
  return (
    <>
      {piecesOf(text).map((piece, index) =>
        piece.kind === 'p' ? (
          <p key={index} className={piece.box === undefined ? undefined : paragraphBoxClass(piece.box)}>
            {piece.lines.map((runs, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? '\n' : null}
                <RunsView runs={runs} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={index} className={piece.box === undefined ? 'np-block-list' : `np-block-list ${paragraphBoxClass(piece.box)}`}>
            {piece.items.map((runs, itemIndex) => (
              <li key={itemIndex}>
                <RunsView runs={runs} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
