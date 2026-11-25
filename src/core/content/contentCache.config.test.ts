// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// P11 T8a: the service worker keeps the published course files (manifest.json, course JSON, pictures) so a course that was opened once
// also works offline, and a content change needs no app update. The rules live in `vite.config.ts`; this test reads that file as text
// and runs the two path rules on example paths.

const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');

/** The regular expression of every `urlPattern: ({ url }) => /.../.test(url.pathname)` rule, in file order. */
const rules: RegExp[] = [...config.matchAll(/urlPattern: \(\{ url \}\) => \/(.+)\/\.test\(url\.pathname\),/g)].flatMap((m) =>
  m[1] === undefined ? [] : [new RegExp(m[1])],
);
const dataMatches = (path: string): boolean => rules[0]?.test(path) ?? false;
const imageMatches = (path: string): boolean => rules[1]?.test(path) ?? false;

describe('service worker rules for the published content (vite.config.ts)', () => {
  it('has the two content rules, each a self-contained function with its own regular expression', () => {
    expect(rules).toHaveLength(2);
  });

  it('data files: NetworkFirst with a 3 s network timeout, in their own cache', () => {
    expect(config).toContain("handler: 'NetworkFirst'");
    expect(config).toContain("cacheName: 'np-content-data'");
    expect(config).toContain('networkTimeoutSeconds: 3');
  });

  it('pictures: shown from the cache and refreshed in the background, at most 200 of them for 30 days', () => {
    expect(config).toContain("handler: 'StaleWhileRevalidate'");
    expect(config).toContain("cacheName: 'np-content-images'");
    expect(config).toContain('maxEntries: 200');
    expect(config).toContain('maxAgeSeconds: 30 * 24 * 60 * 60');
  });

  it('the content is NOT precached: the precache pattern is the old one, and the reader fonts rule is kept', () => {
    expect(config).toContain("globPatterns: ['**/*.{js,css,html,woff}']");
    expect(config).toContain("cacheName: 'np-fonts'");
  });

  it.each([
    '/content/manifest.json',
    '/MyNativePreparation/content/manifest.json',
    '/MyNativePreparation/content/courses/crs-abc12345/course.json',
    '/content/courses/crs-abc12345/tests/tst-abc12345.json',
  ])('the data rule takes %s', (path) => {
    expect(dataMatches(path)).toBe(true);
    expect(imageMatches(path)).toBe(false);
  });

  it.each([
    '/content/courses/crs-abc12345/images/a.svg',
    '/MyNativePreparation/content/courses/crs-abc12345/images/a.webp',
    '/content/courses/crs-abc12345/images/a.png',
    '/content/courses/crs-abc12345/images/a.jpg',
    '/content/courses/crs-abc12345/images/a.jpeg',
    '/content/courses/crs-abc12345/images/a.gif',
  ])('the picture rule takes %s', (path) => {
    expect(imageMatches(path)).toBe(true);
    expect(dataMatches(path)).toBe(false);
  });

  it.each(['/manifest.webmanifest', '/index.html', '/assets/index-abc123.js', '/assets/logo.png', '/pwa-192.png', '/fonts/a.woff2', '/api/manifest.json'])(
    'neither rule takes %s (it is not published content)',
    (path) => {
      expect(dataMatches(path)).toBe(false);
      expect(imageMatches(path)).toBe(false);
    },
  );
});
