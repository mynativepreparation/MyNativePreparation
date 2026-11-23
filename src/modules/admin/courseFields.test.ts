// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CourseCard } from '../../core/content/types';
import { checkCourseFields, courseWithFields, fieldsFromCourse, type CheckedFields } from './courseFields';

const CARD: CourseCard = { id: 'crs_test0001', title: 'Maths', order: 3, description: 'Numbers', cover: 'images/cover.webp' };

function fields(title: string, description: string, order: string) {
  return { title, description, order };
}

describe('fieldsFromCourse', () => {
  it('turns a course card into the strings of the boxes', () => {
    expect(fieldsFromCourse(CARD)).toEqual({ title: 'Maths', description: 'Numbers', order: '3' });
  });

  it('a card without a description gives an empty box', () => {
    const { id, title, order } = CARD;
    expect(fieldsFromCourse({ id, title, order })).toEqual({ title: 'Maths', description: '', order: '3' });
  });
});

describe('checkCourseFields', () => {
  it('accepts good fields and trims the spaces', () => {
    expect(checkCourseFields(fields('  Maths  ', '  Numbers ', ' 7 '))).toEqual({ ok: true, title: 'Maths', description: 'Numbers', order: 7 });
  });

  it('a blank description is left out', () => {
    expect(checkCourseFields(fields('Maths', '   ', '1'))).toEqual({ ok: true, title: 'Maths', description: undefined, order: 1 });
  });

  it('accepts a negative whole number', () => {
    expect(checkCourseFields(fields('Maths', '', '-3'))).toMatchObject({ ok: true, order: -3 });
  });

  it('asks for a title', () => {
    expect(checkCourseFields(fields('   ', '', '1'))).toEqual({ ok: false, errors: { title: 'admin.course.err.title', order: null } });
  });

  it.each(['', 'abc', '1.5', '1e3', '12 3', '+5'])('refuses the order "%s"', (order) => {
    expect(checkCourseFields(fields('Maths', '', order))).toEqual({ ok: false, errors: { title: null, order: 'admin.course.err.order' } });
  });

  it('reports both problems at once', () => {
    expect(checkCourseFields(fields('', '', 'x'))).toEqual({
      ok: false,
      errors: { title: 'admin.course.err.title', order: 'admin.course.err.order' },
    });
  });
});

describe('courseWithFields', () => {
  const checked: CheckedFields = { ok: true, title: 'New name', description: undefined, order: 9 };

  it('keeps the id and the cover of the old card and drops a blank description', () => {
    expect(courseWithFields(CARD, checked)).toEqual({ id: 'crs_test0001', title: 'New name', order: 9, cover: 'images/cover.webp' });
  });

  it('adds the description when there is one', () => {
    expect(courseWithFields(CARD, { ...checked, description: 'Short' })).toMatchObject({ description: 'Short' });
  });

  it('a card without a cover stays without one', () => {
    const { id, title, order } = CARD;
    expect('cover' in courseWithFields({ id, title, order }, checked)).toBe(false);
  });
});
