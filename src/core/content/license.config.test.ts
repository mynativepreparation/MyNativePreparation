// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// P11 T10: the code licence is Apache-2.0 (owner decision, DECISIONS Q29/Q30, final). `package.json` says it and `LICENSE` holds the
// full Apache License 2.0 text. `scripts/p11-license.ps1` downloads that text (Claude has no network); this test fails until it ran.

const rootUrl = (name: string): URL => new URL(`../../../${name}`, import.meta.url);
const pkg = JSON.parse(readFileSync(rootUrl('package.json'), 'utf8')) as { license?: string };

describe('licence of the code', () => {
  it('package.json names Apache-2.0', () => {
    expect(pkg.license).toBe('Apache-2.0');
  });

  it('LICENSE exists and holds the full Apache License 2.0 text', () => {
    expect(existsSync(rootUrl('LICENSE'))).toBe(true);
    const text = readFileSync(rootUrl('LICENSE'), 'utf8').replace(/\s+/g, ' ');
    expect(text).toContain('Apache License Version 2.0, January 2004');
    expect(text).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(text).toContain('END OF TERMS AND CONDITIONS');
    expect(text.length).toBeGreaterThan(10_000);
    expect(text).not.toContain('MIT License');
  });
});
