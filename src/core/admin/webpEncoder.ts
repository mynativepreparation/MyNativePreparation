import type { WebpEncoder } from './image';

// The browser side of the image shrink (P10 T7): decode with createImageBitmap, draw on a canvas at the smaller size, ask the
// canvas for webp. It never throws: any failure (no canvas, no webp support, a broken file) answers null and the screen
// shows "this picture could not be read". Not unit-tested for real pixels (jsdom has no canvas): the owner checks it in T11.

export const browserWebpEncoder: WebpEncoder = async (bytes, mime, maxSide, quality) => {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: mime }));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // A browser without webp support quietly answers png: that is not what we asked for.
    if (blob === null || blob.type !== 'image/webp') return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
};
