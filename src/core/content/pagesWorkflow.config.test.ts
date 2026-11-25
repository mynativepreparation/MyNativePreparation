// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// P11 T10: what the deploy workflow (`.github/workflows/pages.yml`, its own rules are in `deployWorkflow.config.test.ts`) relies on
// outside its own file: `npm run build` is the Vite build, `vite.config.ts` takes the base path from `VITE_BASE` (and names the real
// repository), and `npm ci` has a package-lock.json that git does not ignore.

const rootUrl = (name: string): URL => new URL(`../../../${name}`, import.meta.url);
const viteConfig = readFileSync(rootUrl('vite.config.ts'), 'utf8');
const gitignore = readFileSync(rootUrl('.gitignore'), 'utf8');
const pkg = JSON.parse(readFileSync(rootUrl('package.json'), 'utf8')) as { scripts?: Record<string, string> };

describe('what the deploy workflow relies on', () => {
  it('`npm run build` is the Vite build', () => {
    expect(pkg.scripts?.build).toBe('vite build');
  });

  it('vite.config.ts reads the base path from VITE_BASE and names the real repository', () => {
    expect(viteConfig).toContain("base: process.env.VITE_BASE ?? '/'");
    expect(viteConfig).toContain('/MyNativePreparation/');
    expect(viteConfig).not.toContain('my-native-preparation');
  });

  it('package-lock.json exists and git does not ignore it (npm ci needs it)', () => {
    expect(existsSync(rootUrl('package-lock.json'))).toBe(true);
    const ignored = gitignore.split('\n').map((line) => line.trim());
    expect(ignored).not.toContain('package-lock.json');
  });
});
