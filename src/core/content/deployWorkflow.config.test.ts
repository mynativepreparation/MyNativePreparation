// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// P11 T10: the deploy workflow (`.github/workflows/pages.yml`) builds the app and puts the site, with the published course files, on
// GitHub Pages after every push to `main`. This test reads the file as text and checks the rules of DECISIONS Q29: the two triggers,
// the least permissions, no secret, the five pinned action majors, the build command and the base path of the site.

const yml = readFileSync(new URL('../../../.github/workflows/pages.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The lines of the top-level `permissions:` block (trimmed), in file order. */
const permissionLines = (): string[] => {
  const block = /^permissions:\n((?: {2}\S.*\n?)+)/m.exec(yml);
  return (block?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
};

/** Every `uses: owner/action@vN`, in file order. */
const usedActions = (): string[] => [...yml.matchAll(/uses: (\S+)/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));

describe('deploy workflow (.github/workflows/pages.yml)', () => {
  it('runs on a push to main and by hand, and on nothing else', () => {
    expect(yml).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m);
    expect(yml).not.toContain('pull_request');
    expect(yml).not.toContain('schedule:');
  });

  it('asks for exactly three permissions and nothing wider', () => {
    expect([...permissionLines()].sort()).toEqual(['contents: read', 'id-token: write', 'pages: write']);
    // no job widens them
    expect(yml.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(yml).not.toContain('write-all');
  });

  it('uses no secret', () => {
    expect(yml).not.toContain('secrets.');
    expect(yml).not.toContain('GITHUB_TOKEN');
    // `id-token: write` is one of the three Pages permissions (it ends in `token:`), so it is taken out before the check
    expect(yml.replace('id-token: write', '')).not.toContain('token:');
  });

  it('uses the five official actions at the major versions checked in Q29 (2026-11-23)', () => {
    expect(usedActions()).toEqual([
      'actions/checkout@v7',
      'actions/setup-node@v7',
      'actions/configure-pages@v6',
      'actions/upload-pages-artifact@v5',
      'actions/deploy-pages@v5',
    ]);
  });

  it('installs from the lock file, builds with the repository base path and uploads dist', () => {
    expect(yml).toContain('node-version: 24');
    expect(yml).toContain('cache: npm');
    expect(yml).toContain('- run: npm ci\n');
    expect(yml).toContain('- run: npm run build\n        env:\n          VITE_BASE: /MyNativePreparation/\n');
    expect(yml).toContain('path: dist');
  });

  it('never runs two deploys at once and never cancels one that is running', () => {
    expect(yml).toContain('concurrency:\n  group: pages\n  cancel-in-progress: false\n');
  });

  it('deploys only after the build, to the github-pages environment, and shows the page url', () => {
    expect(yml).toContain('needs: build');
    expect(yml).toContain('name: github-pages');
    expect(yml).toContain('url: ${{ steps.deployment.outputs.page_url }}');
  });
});
