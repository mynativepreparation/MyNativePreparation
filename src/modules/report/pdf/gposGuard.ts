// Guard for a crash inside fontkit (the font engine of @pdf-lib/fontkit 1.1.1), found in the T2 spike (DECISIONS Q21):
// when a Gujarati mark has to be attached to a base glyph that has NO anchor for that mark class, GPOS mark positioning throws
// "Cannot read properties of null (reading 'xCoordinate')" and the whole PDF fails. The guard wraps `applyAnchor` on the GPOS
// processor class so that such a mark is skipped (it keeps its default position) instead of throwing. In the spike 4 marks of the
// test page were skipped and the owner saw no problem. If a real report ever shows a mark off its base, the fix goes HERE
// (for example set the skipped mark's advance to 0).
//
// fontkit does not export that class, so we reach it through a throw-away font: font.layout() creates the layout engine, which
// holds a GPOS processor instance, and the instance leads to the shared prototype. The names are internals of the pinned version;
// `installGposGuard` returns false when they are not found (gposGuard.test.ts and pdfLibSurface.test.ts catch a version change).

export interface FontkitLike {
  create(data: Uint8Array): unknown;
}

type AnyRecord = Record<string, unknown>;

const GUARD_MARK = '__nativeprepGposGuard';

let installed = false;
let skipped = 0;

const isRecord = (value: unknown): value is AnyRecord => (typeof value === 'object' || typeof value === 'function') && value !== null;

/** True after a successful `installGposGuard` call in this page / process. */
export function isGposGuardInstalled(): boolean {
  return installed;
}

/** How many marks the guard has skipped so far (diagnostics and tests). */
export function gposSkippedCount(): number {
  return skipped;
}

export function resetGposSkippedCount(): void {
  skipped = 0;
}

/** `sampleFont` is any Gujarati font file that fontkit can open (the WOFF is fine). Safe to call more than once. */
export function installGposGuard(fontkit: FontkitLike, sampleFont: Uint8Array): boolean {
  try {
    const font = fontkit.create(sampleFont);
    if (!isRecord(font)) return false;

    const layout = font['layout'];
    if (typeof layout === 'function') {
      try {
        layout.call(font, '\u0A95'); // the layout engine object is created before any failure
      } catch {
        // not important: only the engine object is needed
      }
    }

    const holder = font['_layoutEngine'] ?? font['layoutEngine'];
    const engine = isRecord(holder) ? (holder['engine'] ?? holder) : null;
    const processor = isRecord(engine) ? engine['GPOSProcessor'] : null;
    const proto: unknown = isRecord(processor) ? Object.getPrototypeOf(processor) : null;
    if (!isRecord(proto) || typeof proto['applyAnchor'] !== 'function') return false;

    if (proto[GUARD_MARK] === true) {
      installed = true;
      return true;
    }

    const original = proto['applyAnchor'] as (this: unknown, ...args: unknown[]) => unknown;
    proto['applyAnchor'] = function (this: unknown, ...args: unknown[]): unknown {
      const markRecord = args[0];
      const baseAnchor = args[1];
      if (!isRecord(markRecord) || !baseAnchor || !markRecord['markAnchor']) {
        skipped += 1;
        return undefined;
      }
      return original.apply(this, args);
    };
    proto[GUARD_MARK] = true;
    installed = true;
    return true;
  } catch {
    return false;
  }
}
