import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../core/i18n';
import { NO_FIELD_ERRORS, type CourseFieldErrors, type CourseFields } from './courseFields';
import { CourseSettings, type CourseSettingsProps } from './CourseSettings';

// The Settings panel only shows the values it is given and reports what the person types; the course window checks them on Save.

const FIELDS: CourseFields = { title: 'Maths', description: 'Numbers', order: '3' };

function setup(props: Partial<CourseSettingsProps> = {}) {
  const onChange = vi.fn<(fields: CourseFields) => void>();
  const onCoverChange = vi.fn();
  const full: CourseSettingsProps = {
    fields: FIELDS,
    errors: NO_FIELD_ERRORS,
    onChange,
    cover: undefined,
    images: [],
    onCoverChange,
    ...props,
  };
  render(<CourseSettings {...full} />);
  return { onChange, onCoverChange };
}

const titleBox = () => screen.getByLabelText(t('admin.course.fieldTitle'));
const descriptionBox = () => screen.getByLabelText(t('admin.course.fieldDescription'));
const orderBox = () => screen.getByLabelText(t('admin.course.fieldOrder'));

describe('CourseSettings', () => {
  it('shows the three course boxes with their values and the cover field', () => {
    setup();
    expect(titleBox()).toHaveValue('Maths');
    expect(descriptionBox()).toHaveValue('Numbers');
    expect(orderBox()).toHaveValue('3');
    expect(screen.getByText(t('admin.cover.heading'))).toBeInTheDocument();
  });

  it('typing in a box reports the new fields and leaves the other two as they were', () => {
    const { onChange } = setup();
    fireEvent.change(titleBox(), { target: { value: 'Science' } });
    fireEvent.change(descriptionBox(), { target: { value: 'Short' } });
    fireEvent.change(orderBox(), { target: { value: '8' } });
    expect(onChange.mock.calls.map(([next]) => next)).toEqual([
      { title: 'Science', description: 'Numbers', order: '3' },
      { title: 'Maths', description: 'Short', order: '3' },
      { title: 'Maths', description: 'Numbers', order: '8' },
    ]);
  });

  it('shows the error texts next to the boxes that have one', () => {
    const errors: CourseFieldErrors = { title: 'admin.course.err.title', order: 'admin.course.err.order' };
    setup({ errors });
    expect(screen.getByText(t('admin.course.err.title'))).toBeInTheDocument();
    expect(screen.getByText(t('admin.course.err.order'))).toBeInTheDocument();
  });

  it('shows no error text when there is none', () => {
    setup();
    expect(screen.queryByText(t('admin.course.err.title'))).not.toBeInTheDocument();
    expect(screen.queryByText(t('admin.course.err.order'))).not.toBeInTheDocument();
  });

  it('gives the title and order boxes ids that start with the prefix, so the window can focus the first bad one', () => {
    setup({ idPrefix: 'win' });
    expect(titleBox().id).toBe('win-title');
    expect(orderBox().id).toBe('win-order');
  });

  it('turns the boxes off when disabled', () => {
    setup({ disabled: true });
    for (const box of [titleBox(), descriptionBox(), orderBox()]) {
      expect(box).toBeDisabled();
    }
  });
});
