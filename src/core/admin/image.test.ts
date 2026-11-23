// @vitest-environment node
// Image pick tests (P10 T7a). The canvas part is a fake encoder: only the rules are tested here.
import { describe, expect, it } from 'vitest';
import { prepareImage, sniffImageType, SHRINK_STEPS, type WebpEncoder } from './image';
import type { DraftImage } from './model';

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';

function picture(head: readonly number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(head);
  return out;
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

function fakeEncoder(sizeOf: (maxSide: number, quality: number) => number | null) {
  const calls: { mime: string; maxSide: number; quality: number }[] = [];
  const encode: WebpEncoder = (_bytes, mime, maxSide, quality) => {
    calls.push({ mime, maxSide, quality });
    const size = sizeOf(maxSide, quality);
    return Promise.resolve(size === null ? null : new Uint8Array(size));
  };
  return { encode, calls };
}

describe('sniffImageType', () => {
  it('knows the picture types from the first bytes', () => {
    expect(sniffImageType(picture(JPEG, 10))).toBe('image/jpeg');
    expect(sniffImageType(picture(PNG, 10))).toBe('image/png');
    expect(sniffImageType(picture(GIF, 10))).toBe('image/gif');
    expect(sniffImageType(picture(WEBP, 20))).toBe('image/webp');
    expect(sniffImageType(text(SVG))).toBe('image/svg+xml');
    expect(sniffImageType(text('<?xml version="1.0"?>\n<!-- note -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"/>'))).toBe(
      'image/svg+xml',
    );
  });

  it('refuses everything else', () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(text('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(text('<html><svg></svg></html>'))).toBeNull();
    expect(sniffImageType(text('hello'))).toBeNull();
  });
});

describe('prepareImage: pictures that fit', () => {
  it('keeps a small picture exactly as it is, without re-encoding', async () => {
    const enc = fakeEncoder(() => 1);
    const bytes = picture(PNG, 1000);
    const result = await prepareImage(bytes, [], enc.encode);
    expect(result).toEqual({ ok: true, image: { path: 'images/1.png', mime: 'image/png', bytes }, shrunk: false });
    expect(enc.calls).toEqual([]);
  });

  it('uses the next free number of the picture type', async () => {
    const enc = fakeEncoder(() => 1);
    const existing: DraftImage[] = [
      { path: 'images/1.png', mime: 'image/png', bytes: new Uint8Array(1) },
      { path: 'images/2.png', mime: 'image/png', bytes: new Uint8Array(1) },
      { path: 'images/1.webp', mime: 'image/webp', bytes: new Uint8Array(1) },
    ];
    const png = await prepareImage(picture(PNG, 10), existing, enc.encode);
    expect(png.ok && png.image.path).toBe('images/3.png');
    const webp = await prepareImage(picture(WEBP, 20), existing, enc.encode);
    expect(webp.ok && webp.image.path).toBe('images/2.webp');
    const jpeg = await prepareImage(picture(JPEG, 10), existing, enc.encode);
    expect(jpeg.ok && jpeg.image.path).toBe('images/1.jpg');
  });

  it('keeps a small, clean svg and never re-encodes it', async () => {
    const enc = fakeEncoder(() => 1);
    const result = await prepareImage(text(SVG), [], enc.encode);
    expect(result.ok && result.image.path).toBe('images/1.svg');
    expect(result.ok && result.image.mime).toBe('image/svg+xml');
    expect(result.ok && result.shrunk).toBe(false);
    expect(enc.calls).toEqual([]);
  });
});

describe('prepareImage: shrinking', () => {
  it('re-encodes a big picture to webp, step by step, until it fits', async () => {
    const enc = fakeEncoder((maxSide) => Math.round(maxSide / 10));
    const result = await prepareImage(picture(JPEG, 300), [], enc.encode, 100);
    expect(result.ok && result.shrunk).toBe(true);
    expect(result.ok && result.image.mime).toBe('image/webp');
    expect(result.ok && result.image.path).toBe('images/1.webp');
    expect(result.ok && result.image.bytes.length).toBe(80);
    expect(enc.calls.map((c) => c.maxSide)).toEqual([2048, 1600, 1280, 1024, 800]);
    expect(enc.calls.map((c) => c.quality)).toEqual(SHRINK_STEPS.slice(0, 5).map((s) => s.quality));
    expect(enc.calls.every((c) => c.mime === 'image/jpeg')).toBe(true);
  });

  it('shrinks a big png and a big gif the same way', async () => {
    for (const head of [PNG, GIF]) {
      const enc = fakeEncoder(() => 50);
      const result = await prepareImage(picture(head, 300), [], enc.encode, 100);
      expect(result.ok && result.image.mime).toBe('image/webp');
      expect(enc.calls).toHaveLength(1);
    }
  });

  it('refuses a picture that does not fit even at the smallest step', async () => {
    const enc = fakeEncoder(() => 1000);
    const result = await prepareImage(picture(PNG, 5000), [], enc.encode, 100);
    expect(result).toEqual({ ok: false, code: 'too_large' });
    expect(enc.calls).toHaveLength(SHRINK_STEPS.length);
  });

  it('says cannot_read when the browser cannot decode or encode it (null or an exception)', async () => {
    const nothing = fakeEncoder(() => null);
    expect(await prepareImage(picture(PNG, 5000), [], nothing.encode, 100)).toEqual({ ok: false, code: 'cannot_read' });
    expect(nothing.calls).toHaveLength(1);
    const boom: WebpEncoder = () => Promise.reject(new Error('boom'));
    expect(await prepareImage(picture(PNG, 5000), [], boom, 100)).toEqual({ ok: false, code: 'cannot_read' });
  });
});

describe('prepareImage: refusals', () => {
  it('refuses a big svg without trying to re-encode it', async () => {
    const enc = fakeEncoder(() => 1);
    expect(await prepareImage(text(SVG), [], enc.encode, 10)).toEqual({ ok: false, code: 'too_large' });
    expect(enc.calls).toEqual([]);
  });

  it('refuses an svg with scripts, event handlers or embedded pages', async () => {
    const enc = fakeEncoder(() => 1);
    const bad = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    ];
    for (const source of bad) {
      expect(await prepareImage(text(source), [], enc.encode)).toEqual({ ok: false, code: 'unsafe_svg' });
    }
  });

  it('refuses a file that is not a picture, whatever its name says', async () => {
    const enc = fakeEncoder(() => 1);
    expect(await prepareImage(text('%PDF-1.7 not a picture'), [], enc.encode)).toEqual({ ok: false, code: 'unsupported_type' });
    expect(await prepareImage(new Uint8Array(0), [], enc.encode)).toEqual({ ok: false, code: 'unsupported_type' });
    expect(enc.calls).toEqual([]);
  });
});
