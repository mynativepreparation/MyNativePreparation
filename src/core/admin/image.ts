import { MAX_IMAGE_BYTES } from './config';
import { nextImagePath, type DraftImage } from './model';

// Picking an image for a course (P10 T7, DECISIONS Q24). Pure logic: the browser part (canvas) is injected as `encodeWebp`,
// so everything here is tested without a canvas. Rules:
//  - the picture type is read from the BYTES (not from the file name or the browser's guess);
//  - a picture that is already small enough is kept exactly as it is;
//  - a bigger raster picture (png, jpeg, gif, webp) is re-encoded to webp, smaller step by step, until it fits;
//  - an SVG is never re-encoded: a big one is refused, and one with scripts is refused;
//  - nothing here throws: the result carries a code and the screen shows a friendly text.

export type ImageErrorCode = 'unsupported_type' | 'unsafe_svg' | 'too_large' | 'cannot_read';

export type PrepareResult = { ok: true; image: DraftImage; shrunk: boolean } | { ok: false; code: ImageErrorCode };

/** Re-encodes a picture as webp, at most `maxSide` pixels on the longest side. null = could not be decoded or encoded. */
export type WebpEncoder = (bytes: Uint8Array, mime: string, maxSide: number, quality: number) => Promise<Uint8Array | null>;

/** Tried in this order until the result fits the limit. */
export const SHRINK_STEPS: readonly { maxSide: number; quality: number }[] = [
  { maxSide: 2048, quality: 0.85 },
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1280, quality: 0.7 },
  { maxSide: 1024, quality: 0.6 },
  { maxSide: 800, quality: 0.5 },
  { maxSide: 640, quality: 0.4 },
];

function hasBytes(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  return expected.every((value, i) => bytes[at + i] === value);
}

/** True when the text starts with `<svg` (after an optional xml line, comments and doctype). */
function svgStartsOk(bytes: Uint8Array): boolean {
  let s = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^\uFEFF/, '');
  for (;;) {
    const next = s.replace(/^\s+/, '').replace(/^(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i, '');
    if (next === s) break;
    s = next;
  }
  return /^<svg[\s>]/i.test(s);
}

/** The picture type from the first bytes, or null when it is not a picture type the editor accepts. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  if (svgStartsOk(bytes)) return 'image/svg+xml';
  return null;
}

// Things an SVG must not carry into the course: scripts, event handlers, embedded pages, entity tricks.
const UNSAFE_SVG = /<script|javascript:|\son[a-z]+\s*=|<foreignObject|<iframe|<embed|<object|<!ENTITY/i;

const fail = (code: ImageErrorCode): PrepareResult => ({ ok: false, code });

export async function prepareImage(
  bytes: Uint8Array,
  existing: readonly DraftImage[],
  encodeWebp: WebpEncoder,
  limit: number = MAX_IMAGE_BYTES,
): Promise<PrepareResult> {
  const mime = sniffImageType(bytes);
  if (mime === null) return fail('unsupported_type');

  const finish = (outMime: string, outBytes: Uint8Array, shrunk: boolean): PrepareResult => {
    const path = nextImagePath(existing, outMime);
    if (path === null) return fail('unsupported_type');
    return { ok: true, image: { path, mime: outMime, bytes: outBytes }, shrunk };
  };

  if (mime === 'image/svg+xml') {
    if (bytes.length > limit) return fail('too_large');
    if (UNSAFE_SVG.test(new TextDecoder().decode(bytes))) return fail('unsafe_svg');
    return finish(mime, bytes, false);
  }
  if (bytes.length <= limit) return finish(mime, bytes, false);

  for (const step of SHRINK_STEPS) {
    let out: Uint8Array | null;
    try {
      out = await encodeWebp(bytes, mime, step.maxSide, step.quality);
    } catch {
      return fail('cannot_read');
    }
    if (out === null) return fail('cannot_read');
    if (out.length <= limit) return finish('image/webp', out, true);
  }
  return fail('too_large');
}
