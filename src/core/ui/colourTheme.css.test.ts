// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

// The pastel "Colour" theme looks (P10 Q28, T11w): colourTheme.css only sets variables, the components read them with a fallback,
// so Light and Dark do not change. These tests read the stylesheets as text (no browser needed).

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (file: string): string => strip(readFileSync(file, 'utf8'));

const THEME_CSS = read('src/core/ui/colourTheme.css');

interface Rule {
  selector: string;
  body: string;
}

const RULES: Rule[] = [...THEME_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: (match[1] ?? '').trim(),
  body: match[2] ?? '',
}));

const TINTS = [1, 2, 3, 4, 5, 6] as const;
const tintKey = (n: (typeof TINTS)[number]) => `tint${n}` as const;
const onTintKey = (n: (typeof TINTS)[number]) => `onTint${n}` as const;

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('colourTheme.css', () => {
  it('has the rules for the course tiles, the home cards, the settings cards and the bottom bar', () => {
    const selectors = RULES.map((rule) => rule.selector);
    expect(RULES.length).toBe(13);
    expect(selectors.filter((s) => s.includes('.np-course__grid') && s.endsWith('.np-tile')).length).toBe(4);
    expect(selectors.filter((s) => s.includes('.np-home__grid') && s.endsWith('.np-home__card')).length).toBe(6);
    expect(selectors.filter((s) => s.includes('.np-settings__stack')).length).toBe(2);
    expect(selectors.filter((s) => s.endsWith('.np-nav')).length).toBe(1);
  });

  it("every selector starts with [data-theme='colour'], so Light and Dark never match", () => {
    for (const rule of RULES) {
      for (const part of rule.selector.split(',')) expect(part.trim().startsWith("[data-theme='colour']")).toBe(true);
    }
  });

  it('has no raw colour code (only the theme variables)', () => {
    expect(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(THEME_CSS)).toBe(false);
  });

  it('a pastel background always comes with the dark text colour of the same hue', () => {
    for (const rule of RULES) {
      const tints = [...rule.body.matchAll(/var\(--np-color-tint(\d)\)/g)].map((m) => m[1] ?? '');
      const texts = [...rule.body.matchAll(/var\(--np-color-on-tint(\d)\)/g)].map((m) => m[1] ?? '');
      expect(tints.length).toBeGreaterThan(0);
      expect(texts).toEqual(tints);
    }
  });

  it('the four course tiles use tint1 .. tint4 in order', () => {
    TINTS.slice(0, 4).forEach((n) => {
      const rule = RULES.find((r) => r.selector.includes(`li:nth-child(${n}) .np-tile`));
      expect(rule?.body.includes(`var(--np-color-tint${n})`)).toBe(true);
    });
  });
});

describe('the components read the variables with a fallback to the normal colours', () => {
  const FILES: { file: string; reads: string[] }[] = [
    {
      file: 'src/core/ui/Tile.css',
      reads: ['var(--np-tile-bg, var(--np-color-surface))', 'var(--np-tile-fg, var(--np-color-text))'],
    },
    {
      file: 'src/core/ui/Card.css',
      reads: ['var(--np-card-bg, var(--np-color-surface))', 'var(--np-card-fg, var(--np-color-text))'],
    },
    {
      file: 'src/app/Shell.css',
      reads: ['var(--np-nav-bg, var(--np-color-surface))', 'var(--np-nav-fg, var(--np-color-text))'],
    },
  ];

  it.each(FILES)('$file', ({ file, reads }) => {
    const css = read(file);
    for (const text of reads) expect(css).toContain(text);
  });

  it('every variable colourTheme.css sets is read by a component', () => {
    const set = new Set([...THEME_CSS.matchAll(/(--np-(?:tile|card|nav)-(?:bg|fg)):/g)].map((m) => m[1] ?? ''));
    expect([...set].sort()).toEqual(['--np-card-bg', '--np-card-fg', '--np-nav-bg', '--np-nav-fg', '--np-tile-bg', '--np-tile-fg']);
    const all = FILES.map((f) => read(f.file)).join('\n');
    for (const name of set) expect(all).toContain(`var(${name},`);
  });

  it('the primary button uses fill / onFill, which equal accent / onAccent in Light and Dark (so they look the same)', () => {
    const css = read('src/core/ui/Button.css');
    expect(css).toMatch(/\.np-button--primary\s*\{[^}]*background:\s*var\(--np-color-fill\)/);
    expect(css).toMatch(/\.np-button--primary\s*\{[^}]*color:\s*var\(--np-color-on-fill\)/);
    for (const theme of ['light', 'dark'] as const) {
      expect(colors[theme].fill).toBe(colors[theme].accent);
      expect(colors[theme].onFill).toBe(colors[theme].onAccent);
    }
  });

  it('colourTheme.css is loaded by main.tsx, after base.css', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("import './core/ui/colourTheme.css';");
    expect(main.indexOf('colourTheme.css')).toBeGreaterThan(main.indexOf('base.css'));
  });
});

describe('text on the pastel backgrounds stays readable (4.5:1)', () => {
  it.each(TINTS)('every text colour of the Colour theme on tint%i', (n) => {
    const c = colors.colour;
    const background = c[tintKey(n)];
    expect({ onTint: ratio(c[onTintKey(n)], background) >= 4.5 }).toEqual({ onTint: true });
    expect({ text: ratio(c.text, background) >= 4.5 }).toEqual({ text: true });
    expect({ textMuted: ratio(c.textMuted, background) >= 4.5 }).toEqual({ textMuted: true });
    expect({ accent: ratio(c.accent, background) >= 4.5 }).toEqual({ accent: true });
    expect({ danger: ratio(c.danger, background) >= 4.5 }).toEqual({ danger: true });
    expect({ success: ratio(c.success, background) >= 4.5 }).toEqual({ success: true });
  });
});
