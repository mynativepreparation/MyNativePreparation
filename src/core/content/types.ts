// Content model types. Format is described in docs/phases/P03-content-model.md and docs/CONTENT-FORMAT.md.
// This file has no imports on purpose: it is the shared vocabulary of the content system.

export const SCHEMA_VERSION = 1;

export type IdPrefix = 'crs' | 'blk' | 'qst' | 'tst';

/** One entry of manifest.json. `files` maps a path (relative to the content root, e.g. `courses/<id>/course.json`) to its SHA-256 hex. */
export interface ManifestCourse {
  id: string;
  title: string;
  /** Grows by 1 on every publish of this course. */
  version: number;
  files: Record<string, string>;
}

export interface Manifest {
  schemaVersion: number;
  generatedAt: string;
  courses: ManifestCourse[];
}

/** courses/<id>/course.json: what the Home card needs. */
export interface CourseCard {
  id: string;
  title: string;
  description?: string;
  /** Path relative to the course folder, e.g. `images/cover.webp`. */
  cover?: string;
  /** Lower number is shown first. */
  order: number;
}

export type BlockType = 'title' | 'subtitle' | 'text' | 'image';

/**
 * Font type of a text block (DECISIONS Q25, Q26 c). `sans` is the default when `font` is missing.
 * The first three are Noto Sans Gujarati, Noto Serif Gujarati and Hind Vadodara; P10 T11p adds 13 more. This list must stay equal to
 * FONT_IDS in richStyles.ts (the font of one span); fontKinds.test.ts proves it. This file has no imports, so the list is written twice.
 */
export const FONT_KINDS = [
  'sans',
  'serif',
  'humanist',
  'baloo-bhai',
  'mukta-vaani',
  'rasa',
  'kumar-one',
  'noto-sans-devanagari',
  'noto-serif-devanagari',
  'martel',
  'kalam',
  'inter',
  'merriweather',
  'lexend',
  'atkinson',
  'caveat',
] as const;
export type FontKind = (typeof FONT_KINDS)[number];

/** Where a picture sits in the text column (DECISIONS Q26 d). `left` and `right` let the next text flow beside the picture. */
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];
/** Allowed picture size in whole percent: width = share of the text column, height = share of the natural height at that width. */
export const IMAGE_WIDTH_RANGE = { min: 10, max: 100 } as const;
export const IMAGE_HEIGHT_RANGE = { min: 10, max: 300 } as const;

export interface Block {
  id: string;
  type: BlockType;
  /** Required and non-empty for title, subtitle and text. Text and subtitle may hold inline marks (see core/content/inline.ts). */
  text?: string;
  /** Optional font type; only for title, subtitle and text blocks. */
  font?: FontKind;
  /** Required for image: path relative to the course folder, e.g. `images/a.svg`. */
  src?: string;
  /** Used for image; may be an empty string. */
  alt?: string;
  /** Optional, image only: left / center / right. Missing = center, as before. */
  align?: ImageAlign;
  /** Optional, image only: whole percent of the column width (10 to 100). Missing = the picture's natural size, at most the column. */
  width?: number;
  /** Optional, image only: whole percent of the natural height (10 to 300). Missing = keep the picture's proportions. */
  height?: number;
}

export interface BlockFile {
  blocks: Block[];
}

export interface Question {
  id: string;
  text: string;
  /** Exactly 4 options (SPEC D4). Not shuffled in the file. */
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation?: string;
}

export interface Test {
  id: string;
  title?: string;
  image?: string;
  /** Developer-defined number of questions per game (SPEC D7). */
  questionsPerGame: number;
  questions: Question[];
}

/** State of one optional section (overview, content, test) after loading. */
export type SectionState<T> =
  | { state: 'ready'; value: T }
  | { state: 'empty' }
  | { state: 'invalid'; errors: string[] };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
