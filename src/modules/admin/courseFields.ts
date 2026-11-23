import type { CourseCard } from '../../core/content/types';
import type { TextKey } from '../../core/i18n';

// The course details of the Settings panel (P10 T11n step C2b): title, short description and order, as the strings that sit in the boxes.
// The same rules as the old CourseForm: a title is needed, the order is a whole number, a blank description is left out.
// Pure functions: the course window calls `checkCourseFields` when Save is pressed and shows the errors next to the boxes.

const WHOLE_NUMBER = /^-?\d+$/;

export interface CourseFields {
  title: string;
  description: string;
  /** Typed text; checked as a whole number on Save. */
  order: string;
}

export interface CourseFieldErrors {
  title: TextKey | null;
  order: TextKey | null;
}

export const NO_FIELD_ERRORS: CourseFieldErrors = { title: null, order: null };

export type CheckedFields = { ok: true; title: string; description: string | undefined; order: number };
export type FieldsResult = CheckedFields | { ok: false; errors: CourseFieldErrors };

/** The strings of a saved course card, ready for the boxes. */
export function fieldsFromCourse(course: CourseCard): CourseFields {
  return { title: course.title, description: course.description ?? '', order: String(course.order) };
}

/** Checks the three boxes. Spaces around the text are ignored. Never throws. */
export function checkCourseFields(fields: CourseFields): FieldsResult {
  const title = fields.title.trim();
  const order = fields.order.trim();
  const errors: CourseFieldErrors = {
    title: title === '' ? 'admin.course.err.title' : null,
    order: WHOLE_NUMBER.test(order) ? null : 'admin.course.err.order',
  };
  if (errors.title !== null || errors.order !== null) return { ok: false, errors };
  const description = fields.description.trim();
  return { ok: true, title, description: description === '' ? undefined : description, order: Number(order) };
}

/** The course card with the checked fields. The id and an existing cover of `base` are kept. */
export function courseWithFields(base: CourseCard, checked: CheckedFields): CourseCard {
  const course: CourseCard = { id: base.id, title: checked.title, order: checked.order };
  if (checked.description !== undefined) course.description = checked.description;
  if (base.cover !== undefined) course.cover = base.cover;
  return course;
}
