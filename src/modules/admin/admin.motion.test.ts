// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P10 T10: the admin stylesheets keep the app-wide motion rules. Durations come only from `--np-motion-*` tokens (the one
// switch the theme uses for reduced motion), and nothing scrolls smoothly on its own. styles.test.ts already forbids raw
// colours and raw durations everywhere; this file adds the "tokens only for motion" rule for the admin folder.
const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter((name) => name.endsWith('.css'));

describe('admin stylesheets: motion', () => {
  it('finds the admin stylesheets', () => {
    expect(files).toEqual(expect.arrayContaining(['AdminScreen.css', 'CourseManager.css', 'BlockEditor.css']));
  });

  it.each(files)('%s: transitions and animations use motion tokens (or none), no smooth scrolling', (file) => {
    const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
    const motion = lines.filter((line) => /^\s*(transition|animation)(-duration)?\s*:/.test(line));
    const withoutToken = motion.filter((line) => !/var\(--np-motion-|:\s*none/.test(line));
    expect(withoutToken).toEqual([]);
    expect(lines.filter((line) => /scroll-behavior\s*:\s*smooth/.test(line))).toEqual([]);
  });
});
