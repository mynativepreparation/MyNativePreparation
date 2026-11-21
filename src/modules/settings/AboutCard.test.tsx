import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t, tf } from '../../core/i18n';
import { AboutCard } from './AboutCard';

// P09 T4: the About card. The version, licence and library list are checked against the real package.json and LICENSE.
interface PackageJson {
  version: string;
  license: string;
  dependencies: Record<string, string>;
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;

// Every runtime dependency must be named in `about.libraries`. A new dependency makes the "covered" test fail until the line is updated.
const MENTIONED_AS: Record<string, string> = {
  '@pdf-lib/fontkit': 'fontkit',
  '@scure/bip39': '@scure/bip39',
  dexie: 'Dexie',
  'lucide-react': 'lucide',
  'pdf-lib': 'pdf-lib',
  react: 'React',
  'react-dom': 'React',
  'react-router-dom': 'React Router',
  'react-zoom-pan-pinch': 'react-zoom-pan-pinch',
  'regenerator-runtime': 'regenerator-runtime',
  zustand: 'Zustand',
};

describe('AboutCard: app and version', () => {
  it('shows the heading, the app name and nothing to press (read-only)', () => {
    render(<AboutCard />);
    expect(screen.getByRole('heading', { level: 2, name: t('about.title') })).toBeInTheDocument();
    expect(screen.getByText(t('app.name'))).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('shows the real version from package.json', () => {
    // The build constant is the one source (vite.config.ts `define`); it must equal package.json.
    expect(__APP_VERSION__).toBe(pkg.version);
    render(<AboutCard />);
    expect(screen.getByText(tf('about.version', { version: pkg.version }))).toBeInTheDocument();
    expect(screen.queryByText(tf('about.version', { version: 'unknown' }))).not.toBeInTheDocument();
  });
});

describe('AboutCard: licence', () => {
  it('says MIT licence, free and open source, and the project really is MIT', () => {
    render(<AboutCard />);
    expect(screen.getByText(t('about.licence'))).toBeInTheDocument();
    expect(t('about.licence')).toContain('MIT');
    expect(pkg.license).toBe('MIT');
    expect(readFileSync('LICENSE', 'utf8')).toContain('MIT');
  });
});

describe('AboutCard: data policy', () => {
  it('has a heading and the SAME four statements as the privacy screen (its own keys, no second wording)', () => {
    render(<AboutCard />);
    expect(screen.getByRole('heading', { level: 3, name: t('about.dataTitle') })).toBeInTheDocument();
    for (const key of ['privacy.noServer', 'privacy.noRecovery', 'privacy.notHidden', 'privacy.github'] as const) {
      expect(screen.getByText(t(key)), key).toBeInTheDocument();
    }
  });
});

describe('AboutCard: open-source parts', () => {
  it('has a heading and the libraries line, with the font and its licence', () => {
    render(<AboutCard />);
    expect(screen.getByRole('heading', { level: 3, name: t('about.librariesTitle') })).toBeInTheDocument();
    expect(screen.getByText(t('about.libraries'))).toBeInTheDocument();
    expect(t('about.libraries')).toContain('Noto Sans Gujarati');
    expect(t('about.libraries')).toContain('SIL Open Font License');
  });

  it('every runtime dependency of package.json is covered by the list in this test', () => {
    expect(Object.keys(MENTIONED_AS).sort()).toEqual(Object.keys(pkg.dependencies).sort());
  });

  it('every runtime dependency is named in the libraries line', () => {
    const line = t('about.libraries');
    for (const [dependency, word] of Object.entries(MENTIONED_AS)) {
      expect(line, dependency).toContain(word);
    }
  });
});

describe('AboutCard: style', () => {
  it('its stylesheet wraps long text (overflow-wrap: anywhere)', () => {
    const css = readFileSync('src/modules/settings/AboutCard.css', 'utf8');
    expect(css).toContain('overflow-wrap: anywhere');
  });
});
