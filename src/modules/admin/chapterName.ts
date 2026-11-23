import { chapterNumber } from '../../core/admin/chapterList';
import type { Chapter } from '../../core/admin/chapters';
import { tf } from '../../core/i18n';

/** The name of a chapter in every control and message of the course window: the same words as the heading of the chapter window. */
export function chapterName(label: string, shown: readonly Chapter[], index: number): string {
  const chapter = shown[index];
  if (chapter !== undefined && chapter.title === null) return tf('admin.chapter.leadHeading', { name: label });
  return tf('admin.chapter.heading', { name: label, n: chapterNumber(shown, index) });
}
