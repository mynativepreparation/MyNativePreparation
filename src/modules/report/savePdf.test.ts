import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_NAME,
  MAX_FILE_NAME_LENGTH,
  defaultReportName,
  sanitizeFileName,
  savePdf,
  type SaveEnvironment,
  type SaveInput,
} from './savePdf';

// The save logic is tested on a FAKE environment that records every step. The real browser is judged by the owner on the PC and the phone.

type Mode = 'ok' | 'cancel' | 'fail';

interface Options {
  /** Present = the environment has `showSaveFilePicker` and it behaves like this. */
  picker?: Mode;
  /** Present = the environment has `share` and it behaves like this. */
  share?: Mode;
  /** The answer of `canShare`; absent = the environment has no `canShare`. */
  canShare?: boolean;
  /** `download` throws. */
  downloadFails?: boolean;
}

interface Log {
  steps: string[];
  suggestedNames: string[];
  written: Blob[];
  shared: File[];
  downloaded: { blob: Blob; fileName: string }[];
}

const abortError = (): Error => Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });

function createEnvironment(options: Options = {}): { env: SaveEnvironment; log: Log } {
  const log: Log = { steps: [], suggestedNames: [], written: [], shared: [], downloaded: [] };
  const env: SaveEnvironment = {
    download: (blob, fileName) => {
      log.steps.push('download');
      if (options.downloadFails) throw new Error('download broke');
      log.downloaded.push({ blob, fileName });
    },
  };

  const pickerMode = options.picker;
  if (pickerMode !== undefined) {
    env.showSaveFilePicker = (pickerOptions) => {
      log.steps.push('picker');
      log.suggestedNames.push(pickerOptions.suggestedName);
      if (pickerMode === 'cancel') return Promise.reject(abortError());
      if (pickerMode === 'fail') return Promise.reject(new Error('picker broke'));
      return Promise.resolve({
        name: 'chosen.pdf',
        createWritable: () =>
          Promise.resolve({
            write: (data: Blob) => {
              log.written.push(data);
              return Promise.resolve();
            },
            close: () => {
              log.steps.push('close');
              return Promise.resolve();
            },
          }),
      });
    };
  }

  const shareMode = options.share;
  if (shareMode !== undefined) {
    env.share = (data) => {
      log.steps.push('share');
      log.shared.push(...data.files);
      if (shareMode === 'cancel') return Promise.reject(abortError());
      if (shareMode === 'fail') return Promise.reject(new Error('share broke'));
      return Promise.resolve();
    };
  }

  const canShareAnswer = options.canShare;
  if (canShareAnswer !== undefined) {
    env.canShare = () => {
      log.steps.push('canShare');
      return canShareAnswer;
    };
  }
  return { env, log };
}

const bytes = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"
const FALLBACK = 'NativePrep-report-2026-11-21';
const input: SaveInput = { bytes, name: 'My report', fallbackName: FALLBACK };

describe('defaultReportName', () => {
  it('is NativePrep-report-YYYY-MM-DD from the local date', () => {
    expect(defaultReportName(new Date(2026, 10, 21))).toBe('NativePrep-report-2026-11-21');
    expect(defaultReportName(new Date(2026, 0, 5))).toBe('NativePrep-report-2026-01-05');
  });

  it('an invalid date gives the plain default', () => {
    expect(defaultReportName(new Date(Number.NaN))).toBe(DEFAULT_REPORT_NAME);
  });
});

describe('sanitizeFileName', () => {
  it('adds .pdf to a plain name', () => {
    expect(sanitizeFileName('My report', FALLBACK)).toBe('My report.pdf');
  });

  it('removes \\ / : * ? " < > | from the name', () => {
    expect(sanitizeFileName('a\\b/c:d*e?f"g<h>i|j', FALLBACK)).toBe('abcdefghij.pdf');
  });

  it('removes control characters', () => {
    expect(sanitizeFileName('a\u0000b\tc', FALLBACK)).toBe('abc.pdf');
  });

  it('trims spaces and trailing dots', () => {
    expect(sanitizeFileName('  report  ', FALLBACK)).toBe('report.pdf');
    expect(sanitizeFileName('report...', FALLBACK)).toBe('report.pdf');
  });

  it('adds .pdf only once, whatever the case', () => {
    expect(sanitizeFileName('report.pdf', FALLBACK)).toBe('report.pdf');
    expect(sanitizeFileName('report.PDF.pdf', FALLBACK)).toBe('report.pdf');
  });

  it('an empty name (or one that is empty after cleaning) gives the fallback', () => {
    for (const empty of ['', '   ', '///', '.pdf', '...']) {
      expect(sanitizeFileName(empty, FALLBACK), JSON.stringify(empty)).toBe(`${FALLBACK}.pdf`);
    }
  });

  it('the fallback is cleaned too, and an empty fallback gives the plain default', () => {
    expect(sanitizeFileName('', 'a/b')).toBe('ab.pdf');
    expect(sanitizeFileName('', '')).toBe(`${DEFAULT_REPORT_NAME}.pdf`);
  });

  it('keeps Gujarati', () => {
    const name = 'મારો અહેવાલ';
    expect(sanitizeFileName(name, FALLBACK)).toBe(`${name}.pdf`);
  });

  it('cuts a long name to 80 characters before the extension', () => {
    const result = sanitizeFileName('a'.repeat(200), FALLBACK);
    expect(result).toBe(`${'a'.repeat(MAX_FILE_NAME_LENGTH)}.pdf`);
    expect(result).toHaveLength(MAX_FILE_NAME_LENGTH + 4);
  });

  it('never cuts inside a Gujarati conjunct', () => {
    // U+0A95 U+0ACD U+0AB7 is one conjunct (3 characters): it does not fit after 79 letters, so it is dropped whole.
    const name = `${'a'.repeat(MAX_FILE_NAME_LENGTH - 1)}\u0A95\u0ACD\u0AB7x`;
    expect(sanitizeFileName(name, FALLBACK)).toBe(`${'a'.repeat(MAX_FILE_NAME_LENGTH - 1)}.pdf`);
  });

  it('a space left at the cut is trimmed', () => {
    const name = `${'a'.repeat(MAX_FILE_NAME_LENGTH - 1)} bcd`;
    expect(sanitizeFileName(name, FALLBACK)).toBe(`${'a'.repeat(MAX_FILE_NAME_LENGTH - 1)}.pdf`);
  });

  it('cleaning twice gives the same result', () => {
    const once = sanitizeFileName(' a/b..PDF ', FALLBACK);
    expect(sanitizeFileName(once, FALLBACK)).toBe(once);
  });
});

describe('savePdf: the three ways in order', () => {
  it('uses the file picker first and writes the PDF through it', async () => {
    const { env, log } = createEnvironment({ picker: 'ok', share: 'ok', canShare: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'saved', method: 'picker', fileName: 'chosen.pdf' });
    expect(log.steps).toEqual(['picker', 'close']);
    expect(log.suggestedNames).toEqual(['My report.pdf']);
    expect(log.written).toHaveLength(1);
    expect(log.written[0]?.type).toBe('application/pdf');
    expect(log.written[0]?.size).toBe(bytes.length);
  });

  it('shares the file when there is no picker and canShare says yes', async () => {
    const { env, log } = createEnvironment({ share: 'ok', canShare: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'saved', method: 'share', fileName: 'My report.pdf' });
    expect(log.steps).toEqual(['canShare', 'share']);
    expect(log.shared).toHaveLength(1);
    expect(log.shared[0]?.name).toBe('My report.pdf');
    expect(log.shared[0]?.type).toBe('application/pdf');
  });

  it('downloads when canShare says no', async () => {
    const { env, log } = createEnvironment({ share: 'ok', canShare: false });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'saved', method: 'download', fileName: 'My report.pdf' });
    expect(log.steps).toEqual(['canShare', 'download']);
  });

  it('never shares without canShare', async () => {
    const { env, log } = createEnvironment({ share: 'ok' });
    const result = await savePdf(input, env);
    expect(result).toMatchObject({ status: 'saved', method: 'download' });
    expect(log.steps).toEqual(['download']);
  });

  it('downloads a PDF file when nothing else exists', async () => {
    const { env, log } = createEnvironment();
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'saved', method: 'download', fileName: 'My report.pdf' });
    expect(log.downloaded).toHaveLength(1);
    expect(log.downloaded[0]?.fileName).toBe('My report.pdf');
    expect(log.downloaded[0]?.blob.type).toBe('application/pdf');
    expect(log.downloaded[0]?.blob.size).toBe(bytes.length);
  });

  it('uses the cleaned name everywhere', async () => {
    const { env, log } = createEnvironment({ picker: 'ok' });
    await savePdf({ ...input, name: 'a/b:c' }, env);
    expect(log.suggestedNames).toEqual(['abc.pdf']);
  });

  it('an empty name uses the fallback name', async () => {
    const { env, log } = createEnvironment();
    await savePdf({ ...input, name: '  ' }, env);
    expect(log.downloaded[0]?.fileName).toBe(`${FALLBACK}.pdf`);
  });
});

describe('savePdf: cancel and errors', () => {
  it('a cancelled picker is silent and nothing else is tried', async () => {
    const { env, log } = createEnvironment({ picker: 'cancel', share: 'ok', canShare: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'cancelled' });
    expect(log.steps).toEqual(['picker']);
  });

  it('a cancelled share sheet is silent too (no download after it)', async () => {
    const { env, log } = createEnvironment({ share: 'cancel', canShare: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'cancelled' });
    expect(log.steps).toEqual(['canShare', 'share']);
  });

  it('a DOMException named AbortError counts as a cancel', async () => {
    const env: SaveEnvironment = {
      showSaveFilePicker: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
      download: () => {
        throw new Error('must not be called');
      },
    };
    expect(await savePdf(input, env)).toEqual({ status: 'cancelled' });
  });

  it('an error in one way falls through to the next way', async () => {
    const { env, log } = createEnvironment({ picker: 'fail', share: 'ok', canShare: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'saved', method: 'share', fileName: 'My report.pdf' });
    expect(log.steps).toEqual(['picker', 'canShare', 'share']);
  });

  it('when every way fails the last error is returned, not thrown', async () => {
    const { env, log } = createEnvironment({ picker: 'fail', share: 'fail', canShare: true, downloadFails: true });
    const result = await savePdf(input, env);
    expect(result).toEqual({ status: 'failed', message: 'download broke' });
    expect(log.steps).toEqual(['picker', 'canShare', 'share', 'download']);
  });
});
