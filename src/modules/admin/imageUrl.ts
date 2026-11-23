import type { DraftImage } from '../../core/admin/model';

/** A picture of the draft as a `data:` address, so the Admin page can show it before anything is published. */
export function imageToDataUrl(image: DraftImage): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < image.bytes.length; i += step) {
    binary += String.fromCharCode(...Array.from(image.bytes.subarray(i, i + step)));
  }
  return `data:${image.mime};base64,${btoa(binary)}`;
}
