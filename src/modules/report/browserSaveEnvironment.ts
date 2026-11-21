import type { FileHandleLike, FileShareData, SaveEnvironment, SavePickerOptions } from './savePdf';

// The real `SaveEnvironment` for savePdf.ts (P08 T7a): feature detection on the browser, each function bound to its owner
// (a detached `navigator.share` throws "Illegal invocation"), and the download link. The save logic itself lives in savePdf.ts.

/** The parts of `window` used here. Real `window` fits; tests pass a fake. Only what every browser has is required. */
export interface BrowserLike {
  /** Desktop Chromium only. */
  showSaveFilePicker?: (options: SavePickerOptions) => Promise<FileHandleLike>;
  navigator: {
    share?: (data: FileShareData) => Promise<void>;
    canShare?: (data: FileShareData) => boolean;
  };
  document: Document;
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  setTimeout: (handler: () => void, ms: number) => unknown;
}

/** The object URL must live until the browser has read the file, so it is released only after this delay. */
export const REVOKE_DELAY_MS = 10000;

/** Starts a download: a hidden `<a download>` link is added to the page, clicked and removed again. */
export function downloadWithLink(win: BrowserLike, blob: Blob, fileName: string): void {
  const url = win.URL.createObjectURL(blob);
  const link = win.document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  win.document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    win.setTimeout(() => {
      win.URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
  }
}

/** The environment for the real browser: picker / share / canShare only when this browser has them, `download` always. */
export function createBrowserSaveEnvironment(win: BrowserLike = window): SaveEnvironment {
  const env: SaveEnvironment = {
    download: (blob, fileName) => {
      downloadWithLink(win, blob, fileName);
    },
  };

  const picker = win.showSaveFilePicker;
  if (typeof picker === 'function') {
    env.showSaveFilePicker = (options) => picker.call(win, options);
  }

  const browserNavigator = win.navigator;
  const share = browserNavigator.share;
  if (typeof share === 'function') {
    env.share = (data) => share.call(browserNavigator, data);
  }
  const canShare = browserNavigator.canShare;
  if (typeof canShare === 'function') {
    env.canShare = (data) => canShare.call(browserNavigator, data);
  }
  return env;
}
