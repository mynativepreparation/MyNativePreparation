import { newId } from '../content/ids';
import type { Block } from '../content/types';
import { newTitleBlock, type Chapter } from './chapters';

// A chapter as the three boxes of the chapter window show it (P10 T11n step C2c, owner mock-up 2026-11-22): Title, Subtitle, Content.
// The files stay flat (docs/CONTENT-FORMAT.md): a chapter is a `title` block plus body blocks (a subtitle, any number of text blocks,
// pictures). This file maps both ways without losing anything the boxes cannot show.
//  - title    = the text of the title block (empty when the chapter has none);
//  - subtitle = the text of the FIRST subtitle block;
//  - content  = the text blocks one after the other, a blank line between them (the reader draws a blank line as a new paragraph).
// `applyStrings` touches only the part that changed, in place and with the same block ids: an unchanged chapter is returned as the very
// same object, and pictures, extra subtitles and the order of the other blocks stay as they were (pictures inside the text are T11o).
// Pure functions: no DOM, no storage. Nothing is changed in place; the input is never modified.

/** What goes between two text blocks when they are shown as one box. */
export const PARAGRAPH_GAP = '\n\n';

export interface ChapterStrings {
  title: string;
  subtitle: string;
  content: string;
}

export function chapterToStrings(chapter: Chapter): ChapterStrings {
  const subtitle = chapter.body.find((block) => block.type === 'subtitle');
  const content = chapter.body
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join(PARAGRAPH_GAP);
  return { title: chapter.title?.text ?? '', subtitle: subtitle?.text ?? '', content };
}

/** The body with the first subtitle block set to `text` (in place), removed (empty text) or added at the start (none yet). */
function withSubtitle(body: readonly Block[], text: string): Block[] {
  const at = body.findIndex((block) => block.type === 'subtitle');
  if (at >= 0) {
    if (text === '') return body.filter((_, index) => index !== at);
    return body.map((block, index) => (index === at ? { ...block, text } : block));
  }
  if (text === '') return [...body];
  return [{ id: newId('blk'), type: 'subtitle', text }, ...body];
}

/**
 * The body with ALL text set to `text`: the first text block keeps its place, id and other fields and gets the text, the other text
 * blocks are removed, and empty text removes them all. With no text block yet, a new one goes right after the first subtitle (or first).
 */
function withContent(body: readonly Block[], text: string): Block[] {
  const first = body.findIndex((block) => block.type === 'text');
  if (first < 0) {
    if (text === '') return [...body];
    const next = [...body];
    next.splice(body.findIndex((block) => block.type === 'subtitle') + 1, 0, { id: newId('blk'), type: 'text', text });
    return next;
  }
  if (text === '') return body.filter((block) => block.type !== 'text');
  return body.flatMap((block, index) => {
    if (block.type !== 'text') return [block];
    return index === first ? [{ ...block, text }] : [];
  });
}

/**
 * The chapter with the three strings put in. A string that did not change leaves its blocks alone; a chapter that has a title block
 * keeps it even when the title is emptied (a chapter without a title block, except the first, would join the chapter before it on Save),
 * and a chapter without one gets one only when a title is typed.
 */
export function applyStrings(chapter: Chapter, strings: ChapterStrings): Chapter {
  const current = chapterToStrings(chapter);
  const titleChanged = strings.title !== current.title;
  const subtitleChanged = strings.subtitle !== current.subtitle;
  const contentChanged = strings.content !== current.content;
  if (!titleChanged && !subtitleChanged && !contentChanged) return chapter;

  let title = chapter.title;
  if (titleChanged) {
    if (title !== null) title = { ...title, text: strings.title };
    else if (strings.title !== '') title = { ...newTitleBlock(), text: strings.title };
  }

  let body = chapter.body;
  if (subtitleChanged) body = withSubtitle(body, strings.subtitle);
  if (contentChanged) body = withContent(body, strings.content);
  return { title, body };
}
