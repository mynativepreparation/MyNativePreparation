import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  applyStyle,
  clearStyle,
  docFromText,
  docToText,
  setLineBox,
  toggleBullet,
  toggleMark,
  type DocSelection,
  type RichDoc,
} from '../../core/admin/richDoc';
import { COLOR_IDS, FONT_CATALOG, LETTER_BOX_IDS, PARAGRAPH_BOX_IDS, SIZE_IDS, WORD_BOX_IDS } from '../../core/content/richStyles';
import { t, type TextKey } from '../../core/i18n';
import { RichToolbar, type RichToolbarProps } from './RichToolbar';

// The toolbar only calls `apply(edit)`; these tests run the edit that it handed over and compare it with what the engine
// (core/admin/richDoc.ts) gives for the same call, so the wiring (which function, which id, which selection) is what is tested.
const sel = (anchor: number, focus: number, line = 0): DocSelection => ({ anchor: { line, offset: anchor }, focus: { line, offset: focus } });
const ELL = sel(1, 4); // "ell" of "hello"
const CARET = sel(2, 2);

type ApplyMock = Mock<RichToolbarProps['apply']>;

function setup(props: Partial<RichToolbarProps> = {}) {
  const apply: ApplyMock = vi.fn<RichToolbarProps['apply']>();
  const doc = docFromText('hello');
  const full: RichToolbarProps = { doc, selection: ELL, apply, ...props };
  render(<RichToolbar {...full} />);
  return { apply, doc: full.doc };
}

/** What every edit that the toolbar handed to `apply` gives for this doc and selection. */
function results(apply: ApplyMock, doc: RichDoc, selection: DocSelection = ELL): RichDoc[] {
  return apply.mock.calls.map(([edit]) => edit(doc, selection));
}

const button = (key: TextKey) => screen.getByRole('button', { name: t(key) });
const click = (key: TextKey) => fireEvent.click(button(key));
const group = (key: TextKey) => screen.getByRole('group', { name: t(key) });

describe('RichToolbar: the six buttons and the panels', () => {
  it('shows the six tools in order and no panel at the start', () => {
    setup({ onAddPicture: vi.fn(), settings: <p>slot</p> });
    const toolbar = screen.getByRole('toolbar', { name: t('admin.toolbar.label') });
    expect(within(toolbar).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Aa' + t('admin.toolbar.fonts'),
      t('admin.toolbar.style'),
      t('admin.toolbar.boxes'),
      t('admin.toolbar.colour'),
      t('admin.toolbar.add'),
      t('admin.toolbar.settings'),
    ]);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('opens one panel at a time and closes it with the same button', () => {
    setup({ settings: <p>slot</p> });
    click('admin.toolbar.fonts');
    expect(button('admin.toolbar.fonts')).toHaveAttribute('aria-expanded', 'true');
    expect(group('admin.toolbar.fonts')).toBeInTheDocument();

    click('admin.toolbar.style');
    expect(button('admin.toolbar.fonts')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: t('admin.toolbar.fonts') })).not.toBeInTheDocument();
    expect(group('admin.toolbar.style')).toBeInTheDocument();

    click('admin.toolbar.style');
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('links the open button to its panel (aria-controls)', () => {
    setup();
    click('admin.toolbar.colour');
    expect(button('admin.toolbar.colour').getAttribute('aria-controls')).toBe(group('admin.toolbar.colour').id);
  });

  it('Escape closes the panel', () => {
    setup();
    click('admin.toolbar.boxes');
    fireEvent.keyDown(button('admin.toolbar.boxes'), { key: 'Escape' });
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(button('admin.toolbar.boxes')).toHaveAttribute('aria-expanded', 'false');
  });

  it('cancels mouse down on every button so the box keeps its selection', () => {
    setup({ onAddPicture: vi.fn(), settings: <p>slot</p> });
    for (const key of ['admin.toolbar.fonts', 'admin.toolbar.add', 'admin.toolbar.settings'] as const) {
      expect(fireEvent.mouseDown(button(key))).toBe(false);
    }
    click('admin.toolbar.style');
    expect(fireEvent.mouseDown(button('admin.toolbar.bold'))).toBe(false);
    expect(fireEvent.mouseDown(button('admin.toolbar.bullets'))).toBe(false);
  });

  it('opening a panel changes nothing in the text', () => {
    const { apply } = setup();
    for (const key of ['admin.toolbar.fonts', 'admin.toolbar.style', 'admin.toolbar.boxes', 'admin.toolbar.colour'] as const) click(key);
    expect(apply).not.toHaveBeenCalled();
  });

  it('Add calls onAddPicture and is off without it', () => {
    const onAdd = vi.fn();
    setup({ onAddPicture: onAdd });
    click('admin.toolbar.add');
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('Add and Settings are off when there is nothing behind them', () => {
    setup();
    expect(button('admin.toolbar.add')).toBeDisabled();
    expect(button('admin.toolbar.settings')).toBeDisabled();
  });

  it('Settings shows what the window gives it', () => {
    setup({ settings: <p>SETTINGS SLOT</p> });
    click('admin.toolbar.settings');
    expect(within(group('admin.toolbar.settings')).getByText('SETTINGS SLOT')).toBeInTheDocument();
  });

  it('a disabled toolbar turns every button off', () => {
    setup({ disabled: true, onAddPicture: vi.fn(), settings: <p>slot</p> });
    for (const b of within(screen.getByRole('toolbar')).getAllByRole('button')) expect(b).toBeDisabled();
    fireEvent.click(button('admin.toolbar.fonts'));
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });
});

describe('RichToolbar: Style panel', () => {
  it('bold, italic, underline and highlight toggle the marks of the selection', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.style');
    click('admin.toolbar.bold');
    expect(results(apply, doc).map(docToText)).toEqual(['h**ell**o']);

    click('admin.toolbar.italic');
    click('admin.toolbar.underline');
    click('admin.toolbar.highlight');
    expect(apply).toHaveBeenCalledTimes(4);
    expect(results(apply, doc).slice(1)).toEqual([
      toggleMark(doc, ELL, 'italic'),
      toggleMark(doc, ELL, 'underline'),
      toggleMark(doc, ELL, 'highlight'),
    ]);
  });

  it('shows which marks are on (pressed, or "mixed" when only part of the selection has it)', () => {
    setup({ doc: docFromText('h**ell**o') });
    click('admin.toolbar.style');
    expect(button('admin.toolbar.bold')).toHaveAttribute('aria-pressed', 'true');
    expect(button('admin.toolbar.italic')).toHaveAttribute('aria-pressed', 'false');
  });

  it('says "mixed" for a selection that is only partly bold', () => {
    setup({ doc: docFromText('h**ell**o'), selection: sel(0, 5) });
    click('admin.toolbar.style');
    expect(button('admin.toolbar.bold')).toHaveAttribute('aria-pressed', 'mixed');
  });

  it('Bullet list toggles the bullets of the touched lines', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.style');
    click('admin.toolbar.bullets');
    expect(results(apply, doc)).toEqual([toggleBullet(doc, ELL)]);
  });

  it('Clear style removes every style of the selection', () => {
    const { apply, doc } = setup({ doc: docFromText('h**ell**o') });
    click('admin.toolbar.style');
    click('admin.toolbar.clear');
    expect(results(apply, doc)).toEqual([clearStyle(doc, ELL)]);
  });

  it('text sizes: every catalog size plus "Normal size" (which removes the size)', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.style');
    const sizes = within(group('admin.toolbar.sizeGroup')).getAllByRole('button');
    expect(sizes).toHaveLength(SIZE_IDS.length + 1);

    click('admin.toolbar.size.xl');
    click('admin.toolbar.size.normal');
    expect(results(apply, doc)).toEqual([applyStyle(doc, ELL, { size: 'xl' }), applyStyle(doc, ELL, { size: null })]);
  });

  it('shows the size that the selection has', () => {
    setup({ doc: docFromText('h{s=xl|ell}o') });
    click('admin.toolbar.style');
    expect(button('admin.toolbar.size.xl')).toHaveAttribute('aria-pressed', 'true');
    expect(button('admin.toolbar.size.normal')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('RichToolbar: Fonts panel', () => {
  it('lists the fonts of the catalog under their language', () => {
    setup();
    click('admin.toolbar.fonts');
    for (const language of ['gu', 'hi', 'en'] as const) {
      const names = within(group(`admin.toolbar.language.${language}`))
        .getAllByRole('button')
        .map((b) => b.textContent);
      expect(names).toEqual(FONT_CATALOG.filter((font) => font.language === language).map((font) => font.name));
    }
  });

  it('choosing a font (or the default font) changes the selected text', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.fonts');
    fireEvent.click(screen.getByRole('button', { name: 'Noto Serif Gujarati' }));
    click('admin.toolbar.fontDefault');
    expect(results(apply, doc)).toEqual([applyStyle(doc, ELL, { font: 'serif' }), applyStyle(doc, ELL, { font: null })]);
  });

  it('shows the font that the selection has', () => {
    setup({ doc: docFromText('h{f=serif|ell}o') });
    click('admin.toolbar.fonts');
    expect(screen.getByRole('button', { name: 'Noto Serif Gujarati' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Noto Sans Gujarati' })).toHaveAttribute('aria-pressed', 'false');
    expect(button('admin.toolbar.fontDefault')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the default font when the text has no font', () => {
    setup();
    click('admin.toolbar.fonts');
    expect(button('admin.toolbar.fontDefault')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('RichToolbar: Box styles panel', () => {
  it('offers every box of the catalog in its group', () => {
    setup();
    click('admin.toolbar.boxes');
    expect(within(group('admin.toolbar.letterBoxGroup')).getAllByRole('button')).toHaveLength(LETTER_BOX_IDS.length);
    expect(within(group('admin.toolbar.wordBoxGroup')).getAllByRole('button')).toHaveLength(WORD_BOX_IDS.length + 1);
    expect(within(group('admin.toolbar.paragraphBoxGroup')).getAllByRole('button')).toHaveLength(PARAGRAPH_BOX_IDS.length + 1);
  });

  it('letter and word boxes go on the selected text, paragraph boxes on its line', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.boxes');
    click('admin.toolbar.box.l-circle-dark');
    click('admin.toolbar.box.w-dashed');
    click('admin.toolbar.box.p-dashed');
    expect(results(apply, doc)).toEqual([
      applyStyle(doc, ELL, { box: 'l-circle-dark' }),
      applyStyle(doc, ELL, { box: 'w-dashed' }),
      setLineBox(doc, ELL, 'p-dashed'),
    ]);
  });

  it('the two "remove" buttons take the boxes away', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.boxes');
    click('admin.toolbar.noSpanBox');
    click('admin.toolbar.noParagraphBox');
    expect(results(apply, doc)).toEqual([applyStyle(doc, ELL, { box: null }), setLineBox(doc, ELL, null)]);
  });

  it('shows the letter box and the paragraph box that the selection has', () => {
    setup({ doc: docFromText('h{x=l-circle-dark|ell}o') });
    click('admin.toolbar.boxes');
    expect(button('admin.toolbar.box.l-circle-dark')).toHaveAttribute('aria-pressed', 'true');
    expect(button('admin.toolbar.box.l-circle-light')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the paragraph box of the line', () => {
    setup({ doc: docFromText('{{x=p-dashed}}hello') });
    click('admin.toolbar.boxes');
    expect(button('admin.toolbar.box.p-dashed')).toHaveAttribute('aria-pressed', 'true');
    expect(button('admin.toolbar.box.p-round')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('RichToolbar: Colour panel', () => {
  it('has every colour of the catalog and "No colour"', () => {
    setup();
    click('admin.toolbar.colour');
    expect(within(group('admin.toolbar.colorGroup')).getAllByRole('button')).toHaveLength(COLOR_IDS.length + 1);
  });

  it('colours the selected text, or takes the colour away', () => {
    const { apply, doc } = setup();
    click('admin.toolbar.colour');
    click('admin.toolbar.color.red');
    click('admin.toolbar.noColour');
    expect(results(apply, doc).slice(0, 1).map(docToText)).toEqual(['h{c=red|ell}o']);
    expect(results(apply, doc)).toEqual([applyStyle(doc, ELL, { color: 'red' }), applyStyle(doc, ELL, { color: null })]);
  });

  it('shows the colour that the selection has', () => {
    setup({ doc: docFromText('h{c=blue|ell}o') });
    click('admin.toolbar.colour');
    expect(button('admin.toolbar.color.blue')).toHaveAttribute('aria-pressed', 'true');
    expect(button('admin.toolbar.color.red')).toHaveAttribute('aria-pressed', 'false');
    expect(button('admin.toolbar.noColour')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('RichToolbar: nothing selected (a caret)', () => {
  it('turns the letter and word styles off, keeps bullets and paragraph boxes, and says why', () => {
    setup({ selection: CARET, doc: docFromText('- hello') });
    click('admin.toolbar.style');
    expect(screen.getByText(t('admin.toolbar.selectFirst'))).toBeInTheDocument();
    expect(button('admin.toolbar.bold')).toBeDisabled();
    expect(button('admin.toolbar.size.xl')).toBeDisabled();
    expect(button('admin.toolbar.clear')).toBeDisabled();
    expect(button('admin.toolbar.bullets')).toBeEnabled();
    expect(button('admin.toolbar.bullets')).toHaveAttribute('aria-pressed', 'true');

    click('admin.toolbar.boxes');
    expect(button('admin.toolbar.box.l-circle-dark')).toBeDisabled();
    expect(button('admin.toolbar.box.p-dashed')).toBeEnabled();
  });

  it('does the same while the box has not told where the caret is (selection null)', () => {
    setup({ selection: null });
    click('admin.toolbar.colour');
    expect(screen.getByText(t('admin.toolbar.selectFirst'))).toBeInTheDocument();
    expect(button('admin.toolbar.color.red')).toBeDisabled();
  });

  it('a click on an allowed button still goes through (paragraph box on the caret line)', () => {
    const { apply, doc } = setup({ selection: CARET });
    click('admin.toolbar.boxes');
    click('admin.toolbar.box.p-round');
    expect(results(apply, doc, CARET)).toEqual([setLineBox(doc, CARET, 'p-round')]);
  });

  it('shows no hint while text is selected', () => {
    setup();
    click('admin.toolbar.style');
    expect(screen.queryByText(t('admin.toolbar.selectFirst'))).not.toBeInTheDocument();
  });
});
