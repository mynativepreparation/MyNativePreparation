import { describe, expect, it } from 'vitest';
import { t, tf } from './index';
import en from './en.json';

describe('tf', () => {
  it('fills placeholders with numbers and text', () => {
    expect(tf('login.wrongCount', { count: 11 })).toBe('This looks like 11 words, we need 12.');
    expect(tf('login.unknownWord', { n: '4' })).toBe('Word number 4 is not on the word list. Check the spelling.');
  });

  it('leaves a placeholder without a value as written', () => {
    expect(tf('login.wrongCount', {})).toBe('This looks like {count} words, we need 12.');
  });
});

describe('onboarding texts', () => {
  it('state the honest privacy facts (no server, GitHub contact, not-hidden data, no recovery)', () => {
    expect(t('privacy.noServer')).toContain('no server and no account');
    expect(t('privacy.noRecovery')).toContain('nobody can recover them');
    expect(t('privacy.notHidden')).toContain('not hidden');
    expect(t('privacy.github')).toContain('GitHub');
  });

  it('never use the words "military" or "unbreakable"', () => {
    const all = JSON.stringify(en).toLowerCase();
    expect(all).not.toContain('military');
    expect(all).not.toContain('unbreakable');
  });

  it('every text is a non-empty string', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, key).toBe('string');
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});
