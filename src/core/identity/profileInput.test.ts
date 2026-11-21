import { describe, expect, it } from 'vitest';
import { buildProfile, EMAIL_SHAPE } from './profileInput';

// P09 T3: the one copy of the profile input rule (shared by onboarding and Settings).

describe('buildProfile', () => {
  it('an empty form gives an empty profile', () => {
    expect(buildProfile('', '', '')).toEqual({});
  });

  it('fields with only spaces count as empty and are left out', () => {
    expect(buildProfile('   ', '\t', '  ')).toEqual({});
  });

  it('keeps only the filled fields', () => {
    expect(buildProfile('Asha', '', '')).toEqual({ name: 'Asha' });
    expect(buildProfile('', 'asha@example.com', '')).toEqual({ email: 'asha@example.com' });
    expect(buildProfile('', '', '98765 43210')).toEqual({ phone: '98765 43210' });
  });

  it('trims the start and end of every field', () => {
    expect(buildProfile('  Asha  ', ' asha@example.com ', ' 98765 43210 ')).toEqual({
      name: 'Asha',
      email: 'asha@example.com',
      phone: '98765 43210',
    });
  });

  it('leaves the inside of a value as typed (Gujarati name, spaces, plus sign)', () => {
    expect(buildProfile('આશા  પટેલ', '', '+91 98765 43210')).toEqual({ name: 'આશા  પટેલ', phone: '+91 98765 43210' });
  });

  it('a field that is left out is really absent (no undefined key), so saveProfile removes it', () => {
    const profile = buildProfile('Asha', '', '');
    expect(Object.keys(profile)).toEqual(['name']);
  });
});

describe('EMAIL_SHAPE', () => {
  it.each(['a@b.co', 'asha.patel@example.com', 'asha+exam@mail.example.in', 'આશા@example.com'])('accepts %s', (email) => {
    expect(EMAIL_SHAPE.test(email)).toBe(true);
  });

  it.each(['asha', 'asha@', '@example.com', 'asha@example', 'asha@@example.com', 'asha @example.com', 'asha@exa mple.com', ''])(
    'rejects %j',
    (email) => {
      expect(EMAIL_SHAPE.test(email)).toBe(false);
    },
  );

  it('is a plain regex without the g flag, so repeated checks give the same answer', () => {
    expect(EMAIL_SHAPE.global).toBe(false);
    expect(EMAIL_SHAPE.test('a@b.co')).toBe(true);
    expect(EMAIL_SHAPE.test('a@b.co')).toBe(true);
  });
});
