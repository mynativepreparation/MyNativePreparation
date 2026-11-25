import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import { PUBLISH_ERROR_TEXT } from './publishText';
import type { PublishUiErrorCode } from './usePublish';

// P11 T5 step b: every reason a Publish / Unpublish run can fail has ONE friendly text, and that text exists in en.json.

const ALL_CODES: PublishUiErrorCode[] = [
  'invalid_token',
  'unauthorized',
  'forbidden',
  'no_push_right',
  'rate_limited',
  'not_found',
  'offline',
  'timeout',
  'bad_response',
  'bad_path',
  'too_large',
  'conflict',
  'invalid',
  'bad_manifest',
  'not_published',
  'not_logged_in',
];

describe('PUBLISH_ERROR_TEXT', () => {
  it('has a text for every code, and for nothing else', () => {
    expect(Object.keys(PUBLISH_ERROR_TEXT).sort()).toEqual([...ALL_CODES].sort());
  });

  it('every code points to a real sentence: not empty, not the key itself, no unfilled {placeholder}', () => {
    for (const code of ALL_CODES) {
      const key = PUBLISH_ERROR_TEXT[code];
      const text = t(key);
      expect(text.trim()).not.toBe('');
      expect(text).not.toBe(key);
      expect(text).not.toContain('{');
    }
  });

  it('the publish-only codes have their own texts, the GitHub codes reuse the login texts', () => {
    expect(t(PUBLISH_ERROR_TEXT.conflict)).toBe('Someone else published at the same time. Try again.');
    expect(t(PUBLISH_ERROR_TEXT.not_logged_in)).toBe('Log in first.');
    expect(PUBLISH_ERROR_TEXT.rate_limited).toBe('admin.err.rateLimited');
    expect(PUBLISH_ERROR_TEXT.offline).toBe('admin.err.offline');
  });
});
