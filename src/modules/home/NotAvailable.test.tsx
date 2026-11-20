import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import { NotAvailable } from './NotAvailable';

// The owner's exact Gujarati text (SPEC C3). If this string changes, the owner must have asked for it.
const OWNER_TEXT = 'હાલ આ માહિતી ઉપલબ્ધ નથી, રાહ જુઓ. ટૂંક સમયમાં માહિતી ઉપલબ્ધ થશે';

describe('NotAvailable', () => {
  it('uses the owner\u2019s exact Gujarati text', () => {
    expect(t('course.unavailable')).toBe(OWNER_TEXT);
  });

  it('shows that text and passes the id on (for aria-describedby)', () => {
    render(<NotAvailable id="note-1" />);
    const note = screen.getByText(OWNER_TEXT).closest('p');
    expect(note).toHaveAttribute('id', 'note-1');
  });

  it('works without an id', () => {
    render(<NotAvailable />);
    expect(screen.getByText(OWNER_TEXT)).toBeInTheDocument();
  });
});
