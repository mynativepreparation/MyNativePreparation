import { isId } from './ids';
import {
  FONT_KINDS,
  IMAGE_ALIGNS,
  IMAGE_HEIGHT_RANGE,
  IMAGE_WIDTH_RANGE,
  SCHEMA_VERSION,
  type Block,
  type BlockFile,
  type BlockType,
  type CourseCard,
  type FontKind,
  type ImageAlign,
  type Manifest,
  type ManifestCourse,
  type Question,
  type Test,
  type ValidationResult,
} from './types';

// Hand-written validators (no schema library). They accept `unknown`, never throw, and report
// every problem with a readable path such as `questions[2].correctIndex`.

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const TEXT_BLOCKS: BlockType[] = ['title', 'subtitle', 'text'];
const BLOCK_TYPES: BlockType[] = [...TEXT_BLOCKS, 'image'];

/** A relative path that stays inside its folder: no leading slash, no "..", no backslash, no scheme or drive (":"). */
export function isSafeRelativePath(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  if (v.startsWith('/') || v.includes('\\') || v.includes(':')) return false;
  return !v.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}

function done<T>(errors: string[], value: T): ValidationResult<T> {
  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function checkOptionalString(rec: Rec, key: string, path: string, errors: string[]): string | undefined {
  const v = rec[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    errors.push(`${path}${key}: must be a string`);
    return undefined;
  }
  return v;
}

function checkOptionalPath(rec: Rec, key: string, path: string, errors: string[]): string | undefined {
  const v = rec[key];
  if (v === undefined) return undefined;
  if (!isSafeRelativePath(v)) {
    errors.push(`${path}${key}: must be a relative path inside the course folder (no "..", no leading "/")`);
    return undefined;
  }
  return v;
}

/** `font` of a text block: missing is fine (the default font), anything outside the fixed list is an error. */
function checkOptionalFont(rec: Rec, path: string, errors: string[]): FontKind | undefined {
  const v = rec.font;
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(FONT_KINDS as readonly string[]).includes(v)) {
    errors.push(`${path}font: must be one of ${FONT_KINDS.join(', ')}`);
    return undefined;
  }
  return v as FontKind;
}

type ImageLayout = Pick<Block, 'align' | 'width' | 'height'>;

/** `width` or `height` of an image block: missing is fine, otherwise a whole percent inside the range. */
function checkPercent(rec: Rec, key: 'width' | 'height', range: { min: number; max: number }, path: string, errors: string[]): number | undefined {
  const v = rec[key];
  if (v === undefined) return undefined;
  if (!isInt(v) || v < range.min || v > range.max) {
    errors.push(`${path}${key}: must be a whole number from ${range.min} to ${range.max} (percent)`);
    return undefined;
  }
  return v;
}

/** `align`, `width` and `height` of an image block (DECISIONS Q26 d): all optional, each checked on its own; a wrong value is an error. */
function checkImageLayout(rec: Rec, path: string, errors: string[]): ImageLayout {
  const layout: ImageLayout = {};
  const align = rec.align;
  if (align !== undefined) {
    if (typeof align !== 'string' || !(IMAGE_ALIGNS as readonly string[]).includes(align)) {
      errors.push(`${path}align: must be one of ${IMAGE_ALIGNS.join(', ')}`);
    } else {
      layout.align = align as ImageAlign;
    }
  }
  const width = checkPercent(rec, 'width', IMAGE_WIDTH_RANGE, path, errors);
  if (width !== undefined) layout.width = width;
  const height = checkPercent(rec, 'height', IMAGE_HEIGHT_RANGE, path, errors);
  if (height !== undefined) layout.height = height;
  return layout;
}

/** Text blocks cannot have the picture fields. */
function rejectImageOnly(rec: Rec, path: string, errors: string[]): void {
  for (const key of ['align', 'width', 'height'] as const) {
    if (rec[key] !== undefined) errors.push(`${path}${key}: only image blocks can have ${key}`);
  }
}

function checkId(rec: Rec, prefix: 'crs' | 'blk' | 'qst' | 'tst', path: string, errors: string[]): string {
  const v = rec.id;
  if (!isId(prefix, v)) {
    errors.push(`${path}id: must look like "${prefix}-" followed by 8 characters a-z or 0-9`);
    return '';
  }
  return v;
}

function checkDuplicates(ids: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === '') continue;
    if (seen.has(id)) errors.push(`${label}: duplicate id "${id}"`);
    seen.add(id);
  }
}

/** manifest.json */
export function validateManifest(input: unknown): ValidationResult<Manifest> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['manifest: must be an object'] };

  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  }
  if (!isNonEmptyString(input.generatedAt)) errors.push('generatedAt: must be a non-empty string');

  const courses: ManifestCourse[] = [];
  if (!Array.isArray(input.courses)) {
    errors.push('courses: must be an array');
  } else {
    input.courses.forEach((raw, i) => {
      const p = `courses[${i}].`;
      if (!isRecord(raw)) {
        errors.push(`courses[${i}]: must be an object`);
        return;
      }
      const id = checkId(raw, 'crs', p, errors);
      if (!isNonEmptyString(raw.title)) errors.push(`${p}title: must be a non-empty string`);
      if (!isInt(raw.version) || raw.version < 1) errors.push(`${p}version: must be an integer of 1 or more`);

      const files: Record<string, string> = {};
      if (!isRecord(raw.files)) {
        errors.push(`${p}files: must be an object of path -> sha256`);
      } else {
        for (const [file, hash] of Object.entries(raw.files)) {
          if (!isSafeRelativePath(file)) errors.push(`${p}files["${file}"]: unsafe path`);
          else if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
            errors.push(`${p}files["${file}"]: must be a lowercase sha256 hex (64 characters)`);
          } else files[file] = hash;
        }
      }
      courses.push({
        id,
        title: typeof raw.title === 'string' ? raw.title : '',
        version: isInt(raw.version) ? raw.version : 0,
        files,
      });
    });
    checkDuplicates(courses.map((c) => c.id), 'courses', errors);
  }

  return done(errors, {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : '',
    courses,
  });
}

/** courses/<id>/course.json */
export function validateCourseCard(input: unknown): ValidationResult<CourseCard> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['course: must be an object'] };

  const id = checkId(input, 'crs', '', errors);
  if (!isNonEmptyString(input.title)) errors.push('title: must be a non-empty string');
  const description = checkOptionalString(input, 'description', '', errors);
  const cover = checkOptionalPath(input, 'cover', '', errors);
  if (typeof input.order !== 'number' || !Number.isFinite(input.order)) errors.push('order: must be a number');

  const value: CourseCard = {
    id,
    title: typeof input.title === 'string' ? input.title : '',
    order: typeof input.order === 'number' ? input.order : 0,
  };
  if (description !== undefined) value.description = description;
  if (cover !== undefined) value.cover = cover;
  return done(errors, value);
}

/** courses/<id>/overview.json and content.json: `{ "blocks": [...] }`. An empty array is valid. */
export function validateBlocks(input: unknown): ValidationResult<BlockFile> {
  const errors: string[] = [];
  if (!isRecord(input) || !Array.isArray(input.blocks)) {
    return { ok: false, errors: ['file: must be an object with a "blocks" array'] };
  }

  const blocks: Block[] = [];
  input.blocks.forEach((raw, i) => {
    const p = `blocks[${i}].`;
    if (!isRecord(raw)) {
      errors.push(`blocks[${i}]: must be an object`);
      return;
    }
    const id = checkId(raw, 'blk', p, errors);
    const type = raw.type;
    if (typeof type !== 'string' || !BLOCK_TYPES.includes(type as BlockType)) {
      errors.push(`${p}type: must be one of ${BLOCK_TYPES.join(', ')}`);
      return;
    }
    if (TEXT_BLOCKS.includes(type as BlockType)) {
      if (!isNonEmptyString(raw.text)) errors.push(`${p}text: must be a non-empty string for a ${type} block`);
      const font = checkOptionalFont(raw, p, errors);
      rejectImageOnly(raw, p, errors);
      const textBlock: Block = { id, type: type as BlockType, text: typeof raw.text === 'string' ? raw.text : '' };
      if (font !== undefined) textBlock.font = font;
      blocks.push(textBlock);
    } else {
      if (raw.font !== undefined) errors.push(`${p}font: only title, subtitle and text blocks can have a font`);
      if (!isSafeRelativePath(raw.src)) {
        errors.push(`${p}src: must be a relative path inside the course folder (no "..", no leading "/")`);
      }
      if (typeof raw.alt !== 'string') errors.push(`${p}alt: must be a string (may be empty)`);
      const layout = checkImageLayout(raw, p, errors);
      blocks.push({
        id,
        type: 'image',
        src: typeof raw.src === 'string' ? raw.src : '',
        alt: typeof raw.alt === 'string' ? raw.alt : '',
        ...layout,
      });
    }
  });
  checkDuplicates(blocks.map((b) => b.id), 'blocks', errors);
  return done(errors, { blocks });
}

function validateQuestion(raw: unknown, i: number, errors: string[]): Question | null {
  const p = `questions[${i}].`;
  if (!isRecord(raw)) {
    errors.push(`questions[${i}]: must be an object`);
    return null;
  }
  const id = checkId(raw, 'qst', p, errors);
  if (!isNonEmptyString(raw.text)) errors.push(`${p}text: must be a non-empty string`);

  let options: [string, string, string, string] = ['', '', '', ''];
  if (!Array.isArray(raw.options) || raw.options.length !== 4) {
    errors.push(`${p}options: must be an array of exactly 4 strings`);
  } else {
    raw.options.forEach((o, k) => {
      if (!isNonEmptyString(o)) errors.push(`${p}options[${k}]: must be a non-empty string`);
    });
    options = raw.options.map((o) => (typeof o === 'string' ? o : '')) as [string, string, string, string];
  }

  const ci = raw.correctIndex;
  if (!isInt(ci) || ci < 0 || ci > 3) errors.push(`${p}correctIndex: must be an integer from 0 to 3`);
  const explanation = checkOptionalString(raw, 'explanation', p, errors);

  const q: Question = {
    id,
    text: typeof raw.text === 'string' ? raw.text : '',
    options,
    correctIndex: (isInt(ci) && ci >= 0 && ci <= 3 ? ci : 0) as 0 | 1 | 2 | 3,
  };
  if (explanation !== undefined) q.explanation = explanation;
  return q;
}

/** courses/<id>/test.json */
export function validateTest(input: unknown): ValidationResult<Test> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['test: must be an object'] };

  const id = checkId(input, 'tst', '', errors);
  const title = checkOptionalString(input, 'title', '', errors);
  const image = checkOptionalPath(input, 'image', '', errors);
  if (!isInt(input.questionsPerGame) || input.questionsPerGame < 1) {
    errors.push('questionsPerGame: must be an integer of 1 or more');
  }

  const questions: Question[] = [];
  if (!Array.isArray(input.questions)) {
    errors.push('questions: must be an array');
  } else {
    input.questions.forEach((raw, i) => {
      const q = validateQuestion(raw, i, errors);
      if (q) questions.push(q);
    });
    checkDuplicates(questions.map((q) => q.id), 'questions', errors);
  }

  const value: Test = {
    id,
    questionsPerGame: isInt(input.questionsPerGame) ? input.questionsPerGame : 0,
    questions,
  };
  if (title !== undefined) value.title = title;
  if (image !== undefined) value.image = image;
  return done(errors, value);
}
