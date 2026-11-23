import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen, Trash2 } from 'lucide-react';
import { canMove } from '../../core/admin/chapterList';
import type { Chapter } from '../../core/admin/chapters';
import { t, tf } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import { chapterName } from './chapterName';
import './ChapterList.css';

// The chapter list of the course window (P10 T11f, the "Edit" button): every chapter with Open, Up, Down and Delete.
// Delete asks first, because a chapter is deleted with everything in it. It only shows and reports; the window owns the chapters.

interface ChapterListProps {
  /** Name of the part, for example "Overview". It is part of every control name. */
  label: string;
  /** The chapters that are shown (see `visibleChapters`). */
  chapters: readonly Chapter[];
  /** Position of the open chapter. */
  current: number;
  onOpen: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export function ChapterList({ label, chapters, current, onOpen, onMove, onRemove, disabled = false }: ChapterListProps) {
  const headingId = useId();
  /** The position of the chapter whose Delete is waiting for a Yes. */
  const [asking, setAsking] = useState<number | null>(null);

  return (
    <section className="np-chapter-list" aria-labelledby={headingId}>
      <h3 id={headingId} className="np-block-editor__heading">
        {tf('admin.window.listHeading', { name: label })}
      </h3>
      <ul className="np-chapter-list__items" data-np-check>
        {chapters.map((chapter, index) => {
          const name = chapterName(label, chapters, index);
          const titleText = (chapter.title?.text ?? '').trim();
          return (
            <li key={chapter.title === null ? 'lead' : chapter.title.id}>
              <Card className="np-chapter-list__row">
                <div className="np-chapter-list__info">
                  <span className="np-chapter-list__name">{name}</span>
                  {chapter.title !== null && (
                    <span className="np-chapter-list__title">{titleText === '' ? t('admin.window.untitled') : titleText}</span>
                  )}
                  {index === current && <span className="np-chapter-list__meta">{t('admin.window.openNow')}</span>}
                </div>
                {asking === index ? (
                  <div className="np-chapter-list__confirm" role="group" aria-label={tf('admin.window.confirmLabel', { chapter: name })}>
                    <p className="np-chapter-list__text">{tf('admin.window.confirmText', { chapter: name })}</p>
                    <div className="np-chapter-list__actions" data-np-check>
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => {
                          setAsking(null);
                          onRemove(index);
                        }}
                      >
                        {t('admin.window.confirmYes')}
                      </Button>
                      <Button variant="secondary" autoFocus onClick={() => setAsking(null)}>
                        {t('admin.window.confirmNo')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="np-chapter-list__actions" data-np-check>
                    <Button
                      variant="secondary"
                      icon={<FolderOpen size={20} aria-hidden="true" />}
                      aria-label={tf('admin.window.openNamed', { chapter: name })}
                      onClick={() => {
                        setAsking(null);
                        onOpen(index);
                      }}
                      disabled={disabled}
                    >
                      {t('admin.window.open')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<ArrowUp size={20} aria-hidden="true" />}
                      aria-label={tf('admin.window.upNamed', { chapter: name })}
                      onClick={() => {
                        setAsking(null);
                        onMove(index, -1);
                      }}
                      disabled={disabled || !canMove(chapters, index, -1)}
                    >
                      {t('admin.window.up')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<ArrowDown size={20} aria-hidden="true" />}
                      aria-label={tf('admin.window.downNamed', { chapter: name })}
                      onClick={() => {
                        setAsking(null);
                        onMove(index, 1);
                      }}
                      disabled={disabled || !canMove(chapters, index, 1)}
                    >
                      {t('admin.window.down')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Trash2 size={20} aria-hidden="true" />}
                      aria-label={tf('admin.window.deleteNamed', { chapter: name })}
                      onClick={() => setAsking(index)}
                      disabled={disabled}
                    >
                      {t('admin.window.delete')}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
