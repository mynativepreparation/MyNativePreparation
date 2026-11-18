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

export interface Block {
  id: string;
  type: BlockType;
  /** Required and non-empty for title, subtitle and text. */
  text?: string;
  /** Required for image: path relative to the course folder, e.g. `images/a.svg`. */
  src?: string;
  /** Used for image; may be an empty string. */
  alt?: string;
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
