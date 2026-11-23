import type { ImageErrorCode } from '../../core/admin/image';
import type { TextKey } from '../../core/i18n';

/** The friendly sentence (a text key) for every reason a chosen picture can be refused. Shared by the cover and the chapter pictures. */
export const IMAGE_ERROR_TEXT: Record<ImageErrorCode, TextKey> = {
  unsupported_type: 'admin.blocks.err.unsupported',
  unsafe_svg: 'admin.blocks.err.unsafeSvg',
  too_large: 'admin.blocks.err.tooLarge',
  cannot_read: 'admin.blocks.err.cannotRead',
};

/** The bytes of a chosen file, or `null` when the browser cannot read it. */
export async function readBytes(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}
