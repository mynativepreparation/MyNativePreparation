import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyStyle, docFromText, docToText, type DocSelection } from '../../core/admin/richDoc';
import { FONT_CATALOG } from '../../core/content/richStyles';
import { t } from '../../core/i18n';
import { RichToolbar, type RichToolbarProps } from './RichToolbar';

// P10 T11p: the Fonts panel now lists 16 fonts in three language groups (Gujarati, Hindi and Sanskrit, English).
// The wiring tests of the other panels are in RichToolbar.test.tsx; this file only covers the new fonts.

const ELL: DocSelection = { anchor: { line: 0, offset: 1 }, focus: { line: 0, offset: 4 } }; // "ell" of "hello"

function openFontsPanel() {
  const apply = vi.fn<RichToolbarProps['apply']>();
  const doc = docFromText('hello');
  render(<RichToolbar doc={doc} selection={ELL} apply={apply} />);
  fireEvent.click(screen.getByRole('button', { name: t('admin.toolbar.fonts') }));
  const panel = screen.getByRole('group', { name: t('admin.toolbar.fonts') });
  return { apply, doc, panel, buttons: within(panel).getAllByRole('button') };
}

const withName = (buttons: HTMLElement[], name: string): HTMLElement[] => buttons.filter((b) => (b.textContent ?? '').includes(name));

describe('RichToolbar: the Fonts panel with 16 fonts', () => {
  it('has one button for every font of the catalog', () => {
    const { buttons } = openFontsPanel();
    expect(buttons.length).toBeGreaterThanOrEqual(FONT_CATALOG.length);
    FONT_CATALOG.forEach((font) => expect(withName(buttons, font.name), font.name).toHaveLength(1));
  });

  it('names the three language groups, Gujarati first, then Hindi and Sanskrit, then English', () => {
    const { panel } = openFontsPanel();
    const text = panel.textContent ?? '';
    const places = (['gu', 'hi', 'en'] as const).map((language) => text.indexOf(t(`admin.toolbar.language.${language}`)));
    places.forEach((place) => expect(place).toBeGreaterThanOrEqual(0));
    expect(places).toEqual([...places].sort((a, b) => a - b));
  });

  it.each([
    ['Noto Sans Devanagari', 'noto-sans-devanagari'],
    ['Merriweather', 'merriweather'],
    ['Atkinson Hyperlegible', 'atkinson'],
    ['Kumar One', 'kumar-one'],
  ])('choosing "%s" writes the font id %s into the selected text', (name, id) => {
    const { apply, doc, buttons } = openFontsPanel();
    const [choice] = withName(buttons, name);
    fireEvent.click(choice);

    expect(apply).toHaveBeenCalledTimes(1);
    const results = apply.mock.calls.map(([edit]) => edit(doc, ELL));
    expect(results.map(docToText)).toEqual([`h{f=${id}|ell}o`]);
    expect(results).toEqual([applyStyle(doc, ELL, { font: id as (typeof FONT_CATALOG)[number]['id'] })]);
  });
});
