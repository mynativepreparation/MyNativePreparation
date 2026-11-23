import type { Block } from '../content/types';
import { prepareImage, type WebpEncoder } from './image';
import type { DraftImage } from './model';
import { itemsToBlocks, parseHtml, parsePlainText, type PastedItem } from './parsePaste';

// Whole-document paste (P10 T7(c), SPEC D3): what the clipboard holds -> new blocks plus the pictures they need.
//  - Clipboard `text/html` (Word, Google Docs, web pages) is read first: headings -> title / subtitle, paragraphs -> text,
//    pictures -> picture blocks. If it holds nothing, the plain text is used (paragraphs split on blank lines).
//  - Only pictures that are EMBEDDED in the paste (`data:image/...;base64,...`) can be taken: nothing is fetched from the
//    network and `file:` addresses cannot be read by a web page. Each taken picture goes through `prepareImage` (type from the
//    bytes, size limit, safe SVG). Every other picture is skipped and counted, so the screen can say "use Add image for these".
//  - Pure apart from the injected encoder: it never throws and never touches existing blocks or pictures.

export interface PasteInput {
  /** `text/html` of the clipboard; may be empty. */
  html: string;
  /** `text/plain` of the clipboard; may be empty. */
  text: string;
}

export interface PasteResult {
  blocks: Block[];
  /** Only the NEW pictures; the caller adds them to the draft's pictures. */
  images: DraftImage[];
  /** Pictures in the paste that could not be taken. */
  skippedImages: number;
}

function itemsOf(input: PasteInput): PastedItem[] {
  if (input.html.trim() !== '') {
    const fromHtml = parseHtml(input.html);
    if (fromHtml.length > 0) return fromHtml;
  }
  return parsePlainText(input.text);
}

/** The bytes of an embedded picture, or null for any other address (or a broken one). */
function embeddedBytes(source: string): Uint8Array | null {
  const comma = source.indexOf(',');
  if (comma < 0) return null;
  const header = source.slice(0, comma).trim().toLowerCase();
  if (!header.startsWith('data:image/') || !header.endsWith(';base64')) return null;
  try {
    const binary = atob(source.slice(comma + 1).replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function pasteToBlocks(
  input: PasteInput,
  existing: readonly DraftImage[],
  encodeWebp: WebpEncoder,
): Promise<PasteResult> {
  return pasteItems(itemsOf(input), existing, encodeWebp);
}

/** The picture handling shared by every paste: items (already parsed) -> blocks plus the pictures they need. */
export async function pasteItems(
  items: readonly PastedItem[],
  existing: readonly DraftImage[],
  encodeWebp: WebpEncoder,
): Promise<PasteResult> {
  const added: DraftImage[] = [];
  /** picture address in the paste -> stored path; the same picture pasted twice is stored once. */
  const pathOf = new Map<string, string>();

  for (const item of items) {
    if (item.kind !== 'image' || pathOf.has(item.source)) continue;
    const bytes = embeddedBytes(item.source);
    if (bytes === null) continue;
    const result = await prepareImage(bytes, [...existing, ...added], encodeWebp);
    if (!result.ok) continue;
    added.push(result.image);
    pathOf.set(item.source, result.image.path);
  }

  let skipped = 0;
  const blocks = itemsToBlocks(items, (source) => {
    const path = pathOf.get(source);
    if (path === undefined) {
      skipped += 1;
      return null;
    }
    return path;
  });
  return { blocks, images: added, skippedImages: skipped };
}
