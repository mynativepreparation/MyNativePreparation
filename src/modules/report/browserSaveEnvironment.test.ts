import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserSaveEnvironment, downloadWithLink, REVOKE_DELAY_MS, type BrowserLike } from './browserSaveEnvironment';
import type { FileHandleLike, FileShareData, SavePickerOptions } from './savePdf';

// Tested in jsdom with a FAKE window: the real document is used for the download link, the rest (URL, timers, navigator, picker) is fake.
// Real file saving in a browser is judged by the owner on the PC and the phone.

interface ClickRecord {
  href: string | null;
  download: string | null;
  hidden: boolean;
  attached: boolean;
}

interface Timer {
  handler: () => void;
  ms: number;
}

/** A navigator whose methods only work when called ON it (like the real one): a detached call fails with a TypeError. */
class FakeNavigator {
  shared: string[] = [];
  asked: string[] = [];

  share(data: FileShareData): Promise<void> {
    this.shared.push(data.title);
    return Promise.resolve();
  }

  canShare(data: FileShareData): boolean {
    this.asked.push(data.title);
    return true;
  }
}

function createFakeWindow(
  parts: {
    navigator?: BrowserLike['navigator'];
    showSaveFilePicker?: (options: SavePickerOptions) => Promise<FileHandleLike>;
  } = {},
) {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const timers: Timer[] = [];
  const win: BrowserLike = {
    navigator: parts.navigator ?? {},
    document,
    URL: {
      createObjectURL(blob: Blob): string {
        created.push(blob);
        return `blob:fake-${created.length}`;
      },
      revokeObjectURL(url: string): void {
        revoked.push(url);
      },
    },
    setTimeout: (handler, ms) => {
      timers.push({ handler, ms });
      return timers.length;
    },
  };
  if (parts.showSaveFilePicker !== undefined) win.showSaveFilePicker = parts.showSaveFilePicker;
  return { win, created, revoked, timers };
}

describe('browser save environment', () => {
  const clicks: ClickRecord[] = [];
  // Records every click on a link and cancels it, so jsdom does not try to navigate.
  const onClick = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) {
      clicks.push({
        href: target.getAttribute('href'),
        download: target.getAttribute('download'),
        hidden: target.style.display === 'none',
        attached: document.body.contains(target),
      });
    }
    event.preventDefault();
  };

  beforeEach(() => {
    clicks.length = 0;
    document.addEventListener('click', onClick);
  });

  afterEach(() => {
    document.removeEventListener('click', onClick);
    document.body.innerHTML = '';
  });

  describe('downloadWithLink', () => {
    it('clicks a hidden link to the object URL with the file name', () => {
      const { win, created } = createFakeWindow();
      const blob = new Blob(['x'], { type: 'application/pdf' });
      downloadWithLink(win, blob, 'My report.pdf');
      expect(created).toHaveLength(1);
      expect(created[0]).toBe(blob);
      expect(clicks).toEqual([{ href: 'blob:fake-1', download: 'My report.pdf', hidden: true, attached: true }]);
    });

    it('removes the link from the page afterwards', () => {
      const { win } = createFakeWindow();
      downloadWithLink(win, new Blob(['x']), 'a.pdf');
      expect(document.querySelectorAll('a')).toHaveLength(0);
    });

    it('releases the object URL only after a delay', () => {
      const { win, revoked, timers } = createFakeWindow();
      downloadWithLink(win, new Blob(['x']), 'a.pdf');
      expect(revoked).toEqual([]);
      expect(timers).toHaveLength(1);
      expect(timers[0]?.ms).toBe(REVOKE_DELAY_MS);
      timers[0]?.handler();
      expect(revoked).toEqual(['blob:fake-1']);
    });

    it('every download gets its own object URL', () => {
      const { win, revoked, timers } = createFakeWindow();
      downloadWithLink(win, new Blob(['a']), 'a.pdf');
      downloadWithLink(win, new Blob(['b']), 'b.pdf');
      expect(clicks.map((click) => click.href)).toEqual(['blob:fake-1', 'blob:fake-2']);
      for (const timer of timers) timer.handler();
      expect(revoked).toEqual(['blob:fake-1', 'blob:fake-2']);
    });
  });

  describe('createBrowserSaveEnvironment', () => {
    it('offers only the download when the browser has nothing else', () => {
      const env = createBrowserSaveEnvironment(createFakeWindow().win);
      expect(env.showSaveFilePicker).toBeUndefined();
      expect(env.share).toBeUndefined();
      expect(env.canShare).toBeUndefined();
      expect(typeof env.download).toBe('function');
    });

    it('its download starts the link download', () => {
      const env = createBrowserSaveEnvironment(createFakeWindow().win);
      env.download(new Blob(['x']), 'My report.pdf');
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.download).toBe('My report.pdf');
    });

    it('calls share and canShare ON the navigator', async () => {
      const navigator = new FakeNavigator();
      const env = createBrowserSaveEnvironment(createFakeWindow({ navigator }).win);
      const data: FileShareData = { files: [], title: 'My report.pdf' };
      expect(env.canShare?.(data)).toBe(true);
      await env.share?.(data);
      expect(navigator.asked).toEqual(['My report.pdf']);
      expect(navigator.shared).toEqual(['My report.pdf']);
    });

    it('passes share on even without canShare (savePdf then never uses it)', () => {
      const env = createBrowserSaveEnvironment(createFakeWindow({ navigator: { share: () => Promise.resolve() } }).win);
      expect(typeof env.share).toBe('function');
      expect(env.canShare).toBeUndefined();
    });

    it('calls the file picker ON the window and passes the options on', async () => {
      const handle: FileHandleLike = { createWritable: () => Promise.reject(new Error('not used')) };
      const seenThis: unknown[] = [];
      const seenOptions: SavePickerOptions[] = [];
      const { win } = createFakeWindow({
        showSaveFilePicker(this: unknown, options) {
          seenThis.push(this);
          seenOptions.push(options);
          return Promise.resolve(handle);
        },
      });
      const env = createBrowserSaveEnvironment(win);
      const options: SavePickerOptions = { suggestedName: 'a.pdf', types: [] };
      expect(await env.showSaveFilePicker?.(options)).toBe(handle);
      expect(seenThis[0]).toBe(win);
      expect(seenOptions[0]).toBe(options);
    });
  });
});
