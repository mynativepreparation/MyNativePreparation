// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_BASE, resolveContentBase } from './config';
import { contentUrl } from './loader';

// P11 T7: ONE value says where the published course files live (DECISIONS Q24). The default is what the app always used
// (`BASE_URL` + `content/`); a build may set `VITE_CONTENT_BASE` to read the content from somewhere else.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveContentBase', () => {
  it.each([
    ['/', '/content/'],
    ['/MyNativePreparation/', '/MyNativePreparation/content/'],
    ['./', './content/'],
  ])('without an override the app base %s gives %s, the same as before T7', (base, expected) => {
    expect(resolveContentBase(base, undefined)).toBe(expected);
    expect(resolveContentBase(base)).toBe(`${base}content/`);
  });

  it('an app base without a trailing slash still gives a clean address', () => {
    expect(resolveContentBase('/app', undefined)).toBe('/app/content/');
  });

  it.each([
    ['https://example.org/data/', 'https://example.org/data/'],
    ['https://example.org/data', 'https://example.org/data/'],
    ['https://example.org/data///', 'https://example.org/data/'],
    ['  /live-content/  ', '/live-content/'],
  ])('the override %j is used and ends with ONE slash: %s', (override, expected) => {
    expect(resolveContentBase('/app/', override)).toBe(expected);
  });

  it.each([[undefined], [''], ['   '], [null], [42], [{}]])('an override of %j is ignored: the default is used', (override) => {
    expect(resolveContentBase('/app/', override)).toBe('/app/content/');
  });
});

describe('CONTENT_BASE and contentUrl', () => {
  it('the build of the tests has no override, so the base is the old value', () => {
    expect(CONTENT_BASE).toBe(`${import.meta.env.BASE_URL}content/`);
  });

  it('always ends with exactly one slash', () => {
    expect(CONTENT_BASE.endsWith('/')).toBe(true);
    expect(CONTENT_BASE.endsWith('//')).toBe(false);
  });

  it('contentUrl puts the base in front of every path', () => {
    expect(contentUrl('manifest.json')).toBe(`${CONTENT_BASE}manifest.json`);
    expect(contentUrl('courses/crs-abc/course.json')).toBe(`${CONTENT_BASE}courses/crs-abc/course.json`);
    expect(contentUrl('')).toBe(CONTENT_BASE);
  });

  it('VITE_CONTENT_BASE of the build changes the base and every content address', async () => {
    vi.stubEnv('VITE_CONTENT_BASE', 'https://example.org/live');
    vi.resetModules();
    const config = await import('./config');
    const loader = await import('./loader');
    expect(config.CONTENT_BASE).toBe('https://example.org/live/');
    expect(loader.contentUrl('manifest.json')).toBe('https://example.org/live/manifest.json');
  });
});
