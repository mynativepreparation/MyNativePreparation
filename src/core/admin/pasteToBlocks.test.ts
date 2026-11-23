// Whole-document paste tests (P10 T7c). The canvas part is a fake encoder that never shrinks.
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from './image';
import type { DraftImage } from './model';
import { pasteToBlocks } from './pasteToBlocks';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const encode: WebpEncoder = () => Promise.resolve(null);

function pngBytes(seed: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set(PNG_HEAD);
  out[20] = seed;
  return out;
}

function dataUri(mime: string, bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:${mime};base64,${btoa(binary)}`;
}

const svgUri = (svg: string): string => dataUri('image/svg+xml', new TextEncoder().encode(svg));

describe('pasteToBlocks', () => {
  it('turns Word-like HTML into title, subtitle and text blocks', async () => {
    const html = '<h1>પ્રકરણ ૧</h1><h2>પરિચય</h2><p>પહેલો ફકરો.</p><p>બીજો ફકરો.</p>';
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['title', 'subtitle', 'text', 'text']);
    expect(result.blocks.map((b) => b.text)).toEqual(['પ્રકરણ ૧', 'પરિચય', 'પહેલો ફકરો.', 'બીજો ફકરો.']);
    expect(result.images).toEqual([]);
    expect(result.skippedImages).toBe(0);
  });

  it('uses the plain text when the HTML holds nothing', async () => {
    const result = await pasteToBlocks({ html: '   ', text: 'One\n\nTwo\n\nThree' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['text', 'text', 'text']);
    expect(result.blocks.map((b) => b.text)).toEqual(['One', 'Two', 'Three']);
  });

  it('uses the plain text when the HTML has no readable content', async () => {
    const result = await pasteToBlocks({ html: '<style>p{}</style>', text: 'Only text' }, [], encode);
    expect(result.blocks.map((b) => b.text)).toEqual(['Only text']);
  });

  it('gives new ids to every block', async () => {
    const result = await pasteToBlocks({ html: '', text: 'A\n\nB' }, [], encode);
    const ids = result.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('takes an embedded picture and makes a picture block for it', async () => {
    const html = `<p>Before</p><p><img src="${dataUri('image/png', pngBytes(1))}" alt="Map"></p><p>After</p>`;
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['text', 'image', 'text']);
    expect(result.images).toHaveLength(1);
    expect(result.images.map((i) => i.mime)).toEqual(['image/png']);
    expect(result.blocks.map((b) => b.src ?? '')).toEqual(['', ...result.images.map((i) => i.path), '']);
    expect(result.blocks.map((b) => b.alt ?? '')).toEqual(['', 'Map', '']);
    expect(result.skippedImages).toBe(0);
  });

  it('stores the same picture once when it is pasted twice', async () => {
    const uri = dataUri('image/png', pngBytes(2));
    const html = `<p><img src="${uri}"></p><p>Between</p><p><img src="${uri}"></p>`;
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['image', 'text', 'image']);
    expect(result.images).toHaveLength(1);
    const sources = result.blocks.filter((b) => b.type === 'image').map((b) => b.src);
    expect(sources[0]).toBe(sources[1]);
  });

  it('gives different pictures different paths', async () => {
    const html = `<p><img src="${dataUri('image/png', pngBytes(3))}"></p><p><img src="${dataUri('image/png', pngBytes(4))}"></p>`;
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.images).toHaveLength(2);
    expect(new Set(result.images.map((i) => i.path)).size).toBe(2);
  });

  it('skips pictures that are not embedded and counts them', async () => {
    const html =
      '<p>Text</p><p><img src="https://example.com/a.png"></p><p><img src="file:///C:/a.png"></p><p><img src="cid:image001"></p>';
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['text']);
    expect(result.images).toEqual([]);
    expect(result.skippedImages).toBe(3);
  });

  it('skips a broken or unsafe embedded picture instead of failing', async () => {
    const html =
      `<p><img src="data:image/png;base64,@@@"></p>` +
      `<p><img src="${svgUri('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}"></p>` +
      `<p><img src="${dataUri('image/png', new Uint8Array([1, 2, 3, 4]))}"></p>` +
      '<p>Kept</p>';
    const result = await pasteToBlocks({ html, text: '' }, [], encode);
    expect(result.blocks.map((b) => b.type)).toEqual(['text']);
    expect(result.images).toEqual([]);
    expect(result.skippedImages).toBe(3);
  });

  it('keeps existing pictures untouched and never reuses their paths', async () => {
    const existing: DraftImage[] = [{ path: 'images/1.png', mime: 'image/png', bytes: pngBytes(9) }];
    const before = existing.map((i) => Array.from(i.bytes).join(','));
    const html = `<p><img src="${dataUri('image/png', pngBytes(5))}"></p>`;
    const result = await pasteToBlocks({ html, text: '' }, existing, encode);
    expect(existing).toHaveLength(1);
    expect(existing.map((i) => Array.from(i.bytes).join(','))).toEqual(before);
    expect(result.images.map((i) => i.path)).not.toContain('images/1.png');
  });

  it('returns nothing for an empty paste', async () => {
    const result = await pasteToBlocks({ html: '', text: '' }, [], encode);
    expect(result).toEqual({ blocks: [], images: [], skippedImages: 0 });
  });
});
