import { useId } from 'react';
import { Pencil, Plus, Save, Upload } from 'lucide-react';
import { t } from '../../core/i18n';
import { Button } from '../../core/ui';
import './WindowBar.css';

// The bottom bar of the course window (P10 T11n step C2, owner mock-up 2026-11-22): Save (green), Edit (blue) and Publish (orange);
// Add chapter sits under them. Publish is off (with a note) unless the window hands in `onPublish` (P11 T5b: the owner is logged in).
// Edit and Add chapter belong to the parts that have
// chapters (Overview, Content): the Test part leaves `onToggleEdit` and `onAddChapter` out and the bar shows neither.
// The bar owns no state: the window decides what Save, Edit and Add do.

export interface WindowBarProps {
  /** True while a save or a publish is running: every button is off. */
  busy?: boolean;
  onSave: () => void;
  /** Publish the open course (the window asks first). Left out = Publish stays off and the note says why. */
  onPublish?: () => void;
  /** Add a chapter after the open one. Left out for the Test part. */
  onAddChapter?: () => void;
  /** Open or close the chapter list (open, move, delete). Left out for the Test part. */
  onToggleEdit?: () => void;
  /** Whether the chapter list is open (`aria-expanded` of Edit). */
  editOpen?: boolean;
  onCancel?: () => void;
}

export function WindowBar({
  busy = false,
  onSave,
  onPublish,
  onAddChapter,
  onToggleEdit,
  editOpen = false,
  onCancel,
}: WindowBarProps) {
  const noteId = useId();
  return (
    <div className="np-wbar">
      <div className="np-wbar__main" data-np-check>
        <Button className="np-wbar__save" icon={<Save size={20} aria-hidden="true" />} onClick={onSave} disabled={busy}>
          {t('admin.course.save')}
        </Button>
        {onToggleEdit !== undefined && (
          <Button
            className="np-wbar__edit"
            icon={<Pencil size={20} aria-hidden="true" />}
            aria-expanded={editOpen}
            onClick={onToggleEdit}
            disabled={busy}
          >
            {t('admin.window.edit')}
          </Button>
        )}
        <Button
          className="np-wbar__publish"
          icon={<Upload size={20} aria-hidden="true" />}
          {...(onPublish === undefined ? { 'aria-describedby': noteId } : { onClick: onPublish })}
          disabled={onPublish === undefined || busy}
        >
          {t('admin.window.publish')}
        </Button>
      </div>
      {onAddChapter !== undefined && (
        <Button
          variant="secondary"
          className="np-wbar__add"
          icon={<Plus size={20} aria-hidden="true" />}
          onClick={onAddChapter}
          disabled={busy}
        >
          {t('admin.window.add')}
        </Button>
      )}
      {onPublish === undefined && (
        <p id={noteId} className="np-wbar__note">
          {t('admin.window.publishNote')}
        </p>
      )}
      {onCancel !== undefined && (
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t('admin.course.cancel')}
        </Button>
      )}
    </div>
  );
}
