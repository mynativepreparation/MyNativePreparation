import { describe, expect, it } from 'vitest';
import { reportLabels } from './labels';

describe('reportLabels', () => {
  it('every label is a non-empty text from the app text file', () => {
    const labels = reportLabels();
    const { pageOf, ...texts } = labels;
    for (const [key, value] of Object.entries(texts)) {
      expect(typeof value, key).toBe('string');
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/^reportPdf\./);
    }
    expect(typeof pageOf).toBe('function');
  });

  it('pageOf fills the page numbers', () => {
    expect(reportLabels().pageOf(2, 5)).toBe('Page 2 of 5');
  });
});
