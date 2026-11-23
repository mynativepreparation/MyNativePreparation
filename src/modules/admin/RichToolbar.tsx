import { useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Brush, Frame, ImagePlus, Palette, Settings } from 'lucide-react';
import {
  applyStyle,
  boxOf,
  clearStyle,
  colorOf,
  fontOf,
  markState,
  setLineBox,
  sizeOf,
  toggleBullet,
  toggleMark,
  type DocSelection,
  type MarkName,
  type MarkState,
  type RichDoc,
} from '../../core/admin/richDoc';
import {
  COLOR_IDS,
  FONT_CATALOG,
  LETTER_BOX_IDS,
  PARAGRAPH_BOX_IDS,
  SIZE_IDS,
  WORD_BOX_IDS,
  type ColorId,
  type FontInfo,
  type LetterBoxId,
  type ParagraphBoxId,
  type SizeId,
  type WordBoxId,
} from '../../core/content/richStyles';
import { t, type TextKey } from '../../core/i18n';
import { endOf } from './richBoxModel';
import './RichToolbar.css';

// The toolbar of the Admin window (P10 T11n step B, DECISIONS Q26): six colourful buttons. Fonts, Style, Box styles, Colour and Settings
// open ONE panel at a time under the buttons; Add (picture) only calls `onAddPicture` (the picture flow is T11o).
// It never touches the doc itself: every click calls `apply((doc, selection) => newDoc)` of `useRichDoc`, so each click is one undo step.
// Buttons cancel `mousedown`, so the box keeps its focus and its selection while a button is pressed.
// The engine changes only SELECTED text (a caret changes nothing), so letter and word styles are off until some text is selected;
// bullets and paragraph boxes work on the line of the caret.

type Edit = (doc: RichDoc, selection: DocSelection) => RichDoc;
type PanelId = 'fonts' | 'style' | 'boxes' | 'colour' | 'settings';
type Pressed = boolean | 'mixed';

export interface RichToolbarProps {
  doc: RichDoc;
  /** `null` = the box has not told yet where the caret is. */
  selection: DocSelection | null;
  apply: (edit: Edit) => void;
  /** Add (picture). Without it the Add button is off. */
  onAddPicture?: () => void;
  /** Content of the Settings panel (course details, text size of the window). Without it the Settings button is off. */
  settings?: ReactNode;
  disabled?: boolean;
}

const COLOR_KEYS: Record<ColorId, TextKey> = {
  red: 'admin.toolbar.color.red',
  orange: 'admin.toolbar.color.orange',
  brown: 'admin.toolbar.color.brown',
  green: 'admin.toolbar.color.green',
  teal: 'admin.toolbar.color.teal',
  blue: 'admin.toolbar.color.blue',
  purple: 'admin.toolbar.color.purple',
  pink: 'admin.toolbar.color.pink',
};

const SIZE_KEYS: Record<SizeId, TextKey> = {
  s: 'admin.toolbar.size.s',
  l: 'admin.toolbar.size.l',
  xl: 'admin.toolbar.size.xl',
  xxl: 'admin.toolbar.size.xxl',
};

const LANGUAGE_KEYS: Record<FontInfo['language'], TextKey> = {
  gu: 'admin.toolbar.language.gu',
  hi: 'admin.toolbar.language.hi',
  en: 'admin.toolbar.language.en',
};

const LETTER_BOX_KEYS: Record<LetterBoxId, TextKey> = {
  'l-circle-light': 'admin.toolbar.box.l-circle-light',
  'l-circle-dark': 'admin.toolbar.box.l-circle-dark',
  'l-square-light': 'admin.toolbar.box.l-square-light',
  'l-square-dark': 'admin.toolbar.box.l-square-dark',
  'l-diamond-light': 'admin.toolbar.box.l-diamond-light',
  'l-diamond-dark': 'admin.toolbar.box.l-diamond-dark',
  'l-round-light': 'admin.toolbar.box.l-round-light',
  'l-round-dark': 'admin.toolbar.box.l-round-dark',
};

const WORD_BOX_KEYS: Record<WordBoxId, TextKey> = {
  'w-box-light': 'admin.toolbar.box.w-box-light',
  'w-box-dark': 'admin.toolbar.box.w-box-dark',
  'w-pill-light': 'admin.toolbar.box.w-pill-light',
  'w-pill-dark': 'admin.toolbar.box.w-pill-dark',
  'w-dashed': 'admin.toolbar.box.w-dashed',
  'w-double': 'admin.toolbar.box.w-double',
  'w-underline': 'admin.toolbar.box.w-underline',
};

const PARAGRAPH_BOX_KEYS: Record<ParagraphBoxId, TextKey> = {
  'p-box-light': 'admin.toolbar.box.p-box-light',
  'p-box-dark': 'admin.toolbar.box.p-box-dark',
  'p-round': 'admin.toolbar.box.p-round',
  'p-dashed': 'admin.toolbar.box.p-dashed',
  'p-double': 'admin.toolbar.box.p-double',
  'p-leftbar': 'admin.toolbar.box.p-leftbar',
  'p-shadow': 'admin.toolbar.box.p-shadow',
};

const MARKS: ReadonlyArray<{ mark: MarkName; key: TextKey }> = [
  { mark: 'bold', key: 'admin.toolbar.bold' },
  { mark: 'italic', key: 'admin.toolbar.italic' },
  { mark: 'underline', key: 'admin.toolbar.underline' },
  { mark: 'highlight', key: 'admin.toolbar.highlight' },
];

/** Keeps the focus (and so the selection) in the text box while a toolbar button is pressed. */
function keepSelection(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function pressedOf(state: MarkState): Pressed {
  if (state === 'all') return true;
  return state === 'some' ? 'mixed' : false;
}

function isCaret(selection: DocSelection): boolean {
  return selection.anchor.line === selection.focus.line && selection.anchor.offset === selection.focus.offset;
}

/** The lines a paragraph command acts on (same rule as the engine: a selection that ends at the start of a line does not include it). */
function touchedLines(selection: DocSelection): number[] {
  const { anchor, focus } = selection;
  const forward = anchor.line < focus.line || (anchor.line === focus.line && anchor.offset <= focus.offset);
  const start = forward ? anchor : focus;
  const end = forward ? focus : anchor;
  const last = end.line > start.line && end.offset === 0 ? end.line - 1 : end.line;
  const lines: number[] = [];
  for (let index = start.line; index <= last; index += 1) lines.push(index);
  return lines;
}

function paragraphBoxOf(doc: RichDoc, selection: DocSelection): ParagraphBoxId | undefined | 'mixed' {
  const boxes = touchedLines(selection).flatMap((index) => {
    const line = doc[index];
    return line === undefined ? [] : [line.box];
  });
  const first = boxes.length === 0 ? undefined : boxes[0];
  return boxes.every((box) => box === first) ? first : 'mixed';
}

function allBullets(doc: RichDoc, selection: DocSelection): boolean {
  const lines = touchedLines(selection).flatMap((index) => {
    const line = doc[index];
    return line === undefined ? [] : [line];
  });
  return lines.length > 0 && lines.every((line) => line.bullet);
}

interface OptionProps {
  label: string;
  pressed: Pressed;
  disabled: boolean;
  onClick: () => void;
  swatch?: ColorId;
}

/** One choice inside a panel (a toggle button). */
function Option({ label, pressed, disabled, onClick, swatch }: OptionProps) {
  return (
    <button type="button" className="np-toolbar__opt" aria-pressed={pressed} disabled={disabled} onMouseDown={keepSelection} onClick={onClick}>
      {swatch !== undefined && <span className={`np-toolbar__swatch np-toolbar__swatch--${swatch}`} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}

/** A one-shot command inside a panel (not a toggle). */
function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="np-toolbar__opt np-toolbar__opt--action" disabled={disabled} onMouseDown={keepSelection} onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="np-toolbar__group">
      <p className="np-toolbar__group-title" aria-hidden="true">
        {title}
      </p>
      <div className="np-toolbar__options">{children}</div>
    </div>
  );
}

interface PanelButtonProps {
  id: PanelId;
  label: string;
  icon: ReactNode;
  open: PanelId | null;
  panelId: string;
  disabled: boolean;
  onToggle: (id: PanelId) => void;
}

function PanelButton({ id, label, icon, open, panelId, disabled, onToggle }: PanelButtonProps) {
  const isOpen = open === id;
  return (
    <button
      type="button"
      className={`np-toolbar__btn np-toolbar__btn--${id}`}
      aria-expanded={isOpen}
      aria-controls={isOpen ? panelId : undefined}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={() => onToggle(id)}
    >
      <span className="np-toolbar__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function RichToolbar({ doc, selection, apply, onAddPicture, settings, disabled = false }: RichToolbarProps) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const panelId = useId();
  const here = selection ?? endOf(doc);
  const hasText = selection !== null && !isCaret(selection);
  const textOff = disabled || !hasText;

  function run(edit: Edit) {
    if (!disabled) apply(edit);
  }

  function toggle(id: PanelId) {
    setOpen((current) => (current === id ? null : id));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || open === null) return;
    event.stopPropagation();
    setOpen(null);
  }

  const note = hasText ? null : <p className="np-toolbar__note">{t('admin.toolbar.selectFirst')}</p>;

  function fontsPanel() {
    const current = fontOf(doc, here);
    const languages = Array.from(new Set(FONT_CATALOG.map((font) => font.language)));
    return (
      <>
        {note}
        <div className="np-toolbar__options">
          <Option
            label={t('admin.toolbar.fontDefault')}
            pressed={current === undefined}
            disabled={textOff}
            onClick={() => run((d, s) => applyStyle(d, s, { font: null }))}
          />
        </div>
        {languages.map((language) => (
          <Group key={language} title={t(LANGUAGE_KEYS[language])}>
            {FONT_CATALOG.filter((font) => font.language === language).map((font) => (
              <Option
                key={font.id}
                label={font.name}
                pressed={current === font.id}
                disabled={textOff}
                onClick={() => run((d, s) => applyStyle(d, s, { font: font.id }))}
              />
            ))}
          </Group>
        ))}
      </>
    );
  }

  function stylePanel() {
    const size = sizeOf(doc, here);
    return (
      <>
        {note}
        <Group title={t('admin.toolbar.marksGroup')}>
          {MARKS.map(({ mark, key }) => (
            <Option
              key={mark}
              label={t(key)}
              pressed={pressedOf(markState(doc, here, mark))}
              disabled={textOff}
              onClick={() => run((d, s) => toggleMark(d, s, mark))}
            />
          ))}
          <Option
            label={t('admin.toolbar.bullets')}
            pressed={allBullets(doc, here)}
            disabled={disabled}
            onClick={() => run((d, s) => toggleBullet(d, s))}
          />
          <Action label={t('admin.toolbar.clear')} disabled={textOff} onClick={() => run((d, s) => clearStyle(d, s))} />
        </Group>
        <Group title={t('admin.toolbar.sizeGroup')}>
          <Option
            label={t('admin.toolbar.size.normal')}
            pressed={size === undefined}
            disabled={textOff}
            onClick={() => run((d, s) => applyStyle(d, s, { size: null }))}
          />
          {SIZE_IDS.map((id) => (
            <Option
              key={id}
              label={t(SIZE_KEYS[id])}
              pressed={size === id}
              disabled={textOff}
              onClick={() => run((d, s) => applyStyle(d, s, { size: id }))}
            />
          ))}
        </Group>
      </>
    );
  }

  function boxesPanel() {
    const spanBox = boxOf(doc, here);
    const paragraphBox = paragraphBoxOf(doc, here);
    return (
      <>
        {note}
        <Group title={t('admin.toolbar.letterBoxGroup')}>
          {LETTER_BOX_IDS.map((id) => (
            <Option
              key={id}
              label={t(LETTER_BOX_KEYS[id])}
              pressed={spanBox === id}
              disabled={textOff}
              onClick={() => run((d, s) => applyStyle(d, s, { box: id }))}
            />
          ))}
        </Group>
        <Group title={t('admin.toolbar.wordBoxGroup')}>
          {WORD_BOX_IDS.map((id) => (
            <Option
              key={id}
              label={t(WORD_BOX_KEYS[id])}
              pressed={spanBox === id}
              disabled={textOff}
              onClick={() => run((d, s) => applyStyle(d, s, { box: id }))}
            />
          ))}
          <Action label={t('admin.toolbar.noSpanBox')} disabled={textOff} onClick={() => run((d, s) => applyStyle(d, s, { box: null }))} />
        </Group>
        <Group title={t('admin.toolbar.paragraphBoxGroup')}>
          {PARAGRAPH_BOX_IDS.map((id) => (
            <Option
              key={id}
              label={t(PARAGRAPH_BOX_KEYS[id])}
              pressed={paragraphBox === id}
              disabled={disabled}
              onClick={() => run((d, s) => setLineBox(d, s, id))}
            />
          ))}
          <Action label={t('admin.toolbar.noParagraphBox')} disabled={disabled} onClick={() => run((d, s) => setLineBox(d, s, null))} />
        </Group>
      </>
    );
  }

  function colourPanel() {
    const current = colorOf(doc, here);
    return (
      <>
        {note}
        <Group title={t('admin.toolbar.colorGroup')}>
          {COLOR_IDS.map((id) => (
            <Option
              key={id}
              label={t(COLOR_KEYS[id])}
              swatch={id}
              pressed={current === id}
              disabled={textOff}
              onClick={() => run((d, s) => applyStyle(d, s, { color: id }))}
            />
          ))}
          <Option
            label={t('admin.toolbar.noColour')}
            pressed={current === undefined}
            disabled={textOff}
            onClick={() => run((d, s) => applyStyle(d, s, { color: null }))}
          />
        </Group>
      </>
    );
  }

  const panelTitles: Record<PanelId, string> = {
    fonts: t('admin.toolbar.fonts'),
    style: t('admin.toolbar.style'),
    boxes: t('admin.toolbar.boxes'),
    colour: t('admin.toolbar.colour'),
    settings: t('admin.toolbar.settings'),
  };

  function panelBody(id: PanelId): ReactNode {
    if (id === 'fonts') return fontsPanel();
    if (id === 'style') return stylePanel();
    if (id === 'boxes') return boxesPanel();
    if (id === 'colour') return colourPanel();
    return settings;
  }

  const common = { open, panelId, onToggle: toggle };

  return (
    <div className="np-toolbar" role="toolbar" aria-label={t('admin.toolbar.label')} onKeyDown={onKeyDown}>
      <div className="np-toolbar__bar">
        <PanelButton
          id="fonts"
          label={panelTitles.fonts}
          icon={<span className="np-toolbar__aa">Aa</span>}
          disabled={disabled}
          {...common}
        />
        <PanelButton id="style" label={panelTitles.style} icon={<Brush size={22} />} disabled={disabled} {...common} />
        <PanelButton id="boxes" label={panelTitles.boxes} icon={<Frame size={22} />} disabled={disabled} {...common} />
        <PanelButton id="colour" label={panelTitles.colour} icon={<Palette size={22} />} disabled={disabled} {...common} />
        <button
          type="button"
          className="np-toolbar__btn np-toolbar__btn--add"
          disabled={disabled || onAddPicture === undefined}
          onMouseDown={keepSelection}
          onClick={() => onAddPicture?.()}
        >
          <span className="np-toolbar__icon" aria-hidden="true">
            <ImagePlus size={22} />
          </span>
          <span>{t('admin.toolbar.add')}</span>
        </button>
        <PanelButton
          id="settings"
          label={panelTitles.settings}
          icon={<Settings size={22} />}
          disabled={disabled || settings === undefined}
          {...common}
        />
      </div>

      {open !== null && (
        <div id={panelId} role="group" aria-label={panelTitles[open]} className="np-toolbar__panel">
          {panelBody(open)}
        </div>
      )}
    </div>
  );
}
