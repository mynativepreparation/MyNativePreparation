import type { WebpEncoder } from '../../core/admin/image';
import type { DraftImage } from '../../core/admin/model';
import { t } from '../../core/i18n';
import { TextField } from '../../core/ui';
import type { CourseFieldErrors, CourseFields } from './courseFields';
import { CoverField } from './CoverField';
import './CourseSettings.css';

// The content of the toolbar's Settings panel (P10 T11n step C2b, owner mock-up 2026-11-22): the course details (title, short
// description, order) and the cover picture. Fully controlled: the course window owns the values and the errors, checks them with
// `checkCourseFields` when Save is pressed, and focuses the first bad box through its id (`${idPrefix}-title`, `${idPrefix}-order`).

export interface CourseSettingsProps {
  fields: CourseFields;
  errors: CourseFieldErrors;
  onChange: (fields: CourseFields) => void;
  cover: string | undefined;
  images: DraftImage[];
  onCoverChange: (cover: string | undefined, images: DraftImage[]) => void;
  disabled?: boolean;
  /** Tests pass a fake; the browser version is the default of the cover field. */
  encodeWebp?: WebpEncoder;
  /** Start of the ids of the boxes. Default `np-course`. */
  idPrefix?: string;
}

export function CourseSettings({
  fields,
  errors,
  onChange,
  cover,
  images,
  onCoverChange,
  disabled = false,
  encodeWebp,
  idPrefix = 'np-course',
}: CourseSettingsProps) {
  return (
    <div className="np-csettings">
      <TextField
        id={`${idPrefix}-title`}
        label={t('admin.course.fieldTitle')}
        value={fields.title}
        onChange={(e) => onChange({ ...fields, title: e.target.value })}
        error={errors.title === null ? '' : t(errors.title)}
        autoComplete="off"
        disabled={disabled}
      />
      <TextField
        label={t('admin.course.fieldDescription')}
        hint={t('admin.course.fieldDescriptionHint')}
        value={fields.description}
        onChange={(e) => onChange({ ...fields, description: e.target.value })}
        autoComplete="off"
        disabled={disabled}
      />
      <TextField
        id={`${idPrefix}-order`}
        label={t('admin.course.fieldOrder')}
        hint={t('admin.course.fieldOrderHint')}
        value={fields.order}
        onChange={(e) => onChange({ ...fields, order: e.target.value })}
        error={errors.order === null ? '' : t(errors.order)}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
      />
      <CoverField
        cover={cover}
        images={images}
        onChange={onCoverChange}
        disabled={disabled}
        {...(encodeWebp === undefined ? {} : { encodeWebp })}
      />
    </div>
  );
}
