// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Block } from '../content/types';
import { createCourseDraft, newTextBlock, type CourseDraft } from './model';
import { summarizeProblems } from './problems';

// P10 T11o O5 (3), decision: an EMPTY picture description is ALLOWED (an empty `alt` marks a decorative picture, screen readers skip it;
// a new picture starts with `alt: ''` and the owner may keep it). This pins that decision, so a later change of the validator cannot start
// blocking Save for it by accident. A picture whose FILE is missing stays a problem.

const FILE = { path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) };

function draftWith(picture: Block): CourseDraft {
  const draft = createCourseDraft({ title: 'Maths' });
  draft.content = [newTextBlock('title', 'Algebra'), newTextBlock('text', 'Before'), picture, newTextBlock('text', 'After')];
  draft.images = [FILE];
  return draft;
}

describe('summarizeProblems: the description of a picture', () => {
  const cases: Array<[string, Block]> = [
    ['an empty description', { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '' }],
    ['a description of spaces only', { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '   ' }],
    ['an empty description on a centred picture with a width', { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '', width: 70 }],
    ['an empty description on a left picture with width and height', { id: 'blk-pic00001', type: 'image', src: 'images/1.png', alt: '', align: 'left', width: 40, height: 150 }],
  ];

  it.each(cases)('%s is not a problem', (_label, picture) => {
    expect(summarizeProblems(draftWith(picture))).toEqual([]);
  });

  it('a picture whose file is not in the draft is still a problem, with or without a description', () => {
    const missing: Block = { id: 'blk-pic00001', type: 'image', src: 'images/9.png', alt: '' };
    expect(summarizeProblems(draftWith(missing)).map((problem) => problem.key)).toEqual(['admin.problem.blockImage']);
  });

  it('a picture with NO description field is still a problem: the format wants the field (validateBlocks), only its text may be empty', () => {
    const noField: Block = { id: 'blk-pic00001', type: 'image', src: 'images/1.png' };
    expect(summarizeProblems(draftWith(noField))).not.toEqual([]);
  });
});
