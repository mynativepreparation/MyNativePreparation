import { splitClusters } from './wrapText';

// Saving the report PDF (P08 T6). Pure logic: no React, no PDF library, and no direct use of `window` or `navigator`:
// everything the browser offers comes in through `SaveEnvironment`, so tests use a fake one and the screen (T7) builds the real one.
//
// Ways to save, feature-detected, tried in this order (never assumed):
//   1. `showSaveFilePicker` (desktop Chromium): the user picks the place, the suggested name is the cleaned file name.
//   2. `share({ files })`, only when `canShare({ files })` says yes (mobile browsers).
//   3. a download link (always there).
// A user cancel (`AbortError`) ends everything silently. Any other error makes the next way run; if every way fails, the LAST error
// is RETURNED as text. `savePdf` never throws.
//
// The functions of the environment are called WITHOUT `this`: build the real environment with bound functions.

export const MAX_FILE_NAME_LENGTH = 80;
/** Used when the typed name and the fallback are both empty after cleaning. */
export const DEFAULT_REPORT_NAME = 'NativePrep-report';

const PDF_MIME = 'application/pdf';
const ILLEGAL_CHARACTERS = '\\/:*?"<>|';

// ---------- file name ----------

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/** Default file name WITHOUT extension: `NativePrep-report-YYYY-MM-DD` (local date). An invalid date gives the plain default. */
export function defaultReportName(date: Date): string {
  if (Number.isNaN(date.getTime())) return DEFAULT_REPORT_NAME;
  return `${DEFAULT_REPORT_NAME}-${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** Drops `\ / : * ? " < > |` and control characters. */
function removeIllegal(text: string): string {
  return Array.from(text)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127 && !ILLEGAL_CHARACTERS.includes(character);
    })
    .join('');
}

/** Trims spaces, then removes trailing dots, spaces and ".pdf" endings (repeated and in any case) until nothing changes. */
function trimEnding(name: string): string {
  let base = name.trim();
  for (;;) {
    const next = base.replace(/\.pdf$/i, '').replace(/[\s.]+$/, '');
    if (next === base) return base;
    base = next;
  }
}

/** At most `max` characters, cut only between clusters (a Gujarati conjunct is never split). */
function cutToLength(name: string, max: number): string {
  let result = '';
  let length = 0;
  for (const cluster of splitClusters(name)) {
    const size = Array.from(cluster).length;
    if (length + size > max) break;
    result += cluster;
    length += size;
  }
  return result;
}

const cleanBase = (name: string): string =>
  trimEnding(cutToLength(trimEnding(removeIllegal(name)), MAX_FILE_NAME_LENGTH));

/**
 * The file name the user typed, made safe: illegal characters removed, trimmed, at most 80 characters (before the extension),
 * `.pdf` added exactly once, Gujarati kept. Empty after cleaning -> the cleaned `fallbackName` -> `DEFAULT_REPORT_NAME`.
 */
export function sanitizeFileName(name: string, fallbackName: string): string {
  const base = cleanBase(name) || cleanBase(fallbackName) || DEFAULT_REPORT_NAME;
  return `${base}.pdf`;
}

// ---------- saving ----------

export type SaveMethod = 'picker' | 'share' | 'download';

export type SaveResult =
  | { status: 'saved'; method: SaveMethod; fileName: string }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export interface SavePickerOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}

export interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  readonly name?: string;
  createWritable(): Promise<WritableLike>;
}

export interface FileShareData {
  files: File[];
  title: string;
}

export interface SaveEnvironment {
  /** The browser's save dialog; leave it out when the browser has none. */
  showSaveFilePicker?: (options: SavePickerOptions) => Promise<FileHandleLike>;
  /** The share sheet; used only together with `canShare`. */
  share?: (data: FileShareData) => Promise<void>;
  canShare?: (data: FileShareData) => boolean;
  /** Last resort: starts a download through a link. */
  download: (blob: Blob, fileName: string) => void;
}

export interface SaveInput {
  bytes: Uint8Array;
  /** The name typed by the user (with or without ".pdf"). */
  name: string;
  /** File name without extension for an empty `name`; the screen passes `defaultReportName(date)`. */
  fallbackName: string;
}

const PICKER_TYPES: SavePickerOptions['types'] = [{ description: 'PDF', accept: { [PDF_MIME]: ['.pdf'] } }];

interface Step {
  method: SaveMethod;
  /** Resolves to the saved file name, or to null when this way is not possible after all (then the next way runs). */
  run: () => Promise<string | null>;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error === undefined ? 'Unknown error' : String(error);
}

/** A copy of the bytes in a plain buffer, so the file does not change when the caller reuses its array. */
function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], { type: PDF_MIME });
}

export async function savePdf(input: SaveInput, env: SaveEnvironment): Promise<SaveResult> {
  const fileName = sanitizeFileName(input.name, input.fallbackName);
  const blob = toBlob(input.bytes);
  const steps: Step[] = [];

  const pick = env.showSaveFilePicker;
  if (pick !== undefined) {
    steps.push({
      method: 'picker',
      run: async () => {
        const handle = await pick({ suggestedName: fileName, types: PICKER_TYPES });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return handle.name ?? fileName;
      },
    });
  }

  const share = env.share;
  const canShare = env.canShare;
  if (share !== undefined && canShare !== undefined) {
    steps.push({
      method: 'share',
      run: async () => {
        const data: FileShareData = { files: [new File([blob], fileName, { type: PDF_MIME })], title: fileName };
        if (!canShare(data)) return null;
        await share(data);
        return fileName;
      },
    });
  }

  steps.push({
    method: 'download',
    run: async () => {
      env.download(blob, fileName);
      return fileName;
    },
  });

  let lastError: unknown;
  for (const step of steps) {
    try {
      const savedName = await step.run();
      if (savedName !== null) return { status: 'saved', method: step.method, fileName: savedName };
    } catch (error: unknown) {
      if (isAbortError(error)) return { status: 'cancelled' };
      lastError = error;
    }
  }
  return { status: 'failed', message: describeError(lastError) };
}
