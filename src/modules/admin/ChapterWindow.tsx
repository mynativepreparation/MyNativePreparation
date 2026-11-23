import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { START_SLOT, type ContentItem, type PicturePatch, type PictureSplit } from '../../core/admin/chapterSlots';
import { splitDocText } from '../../core/admin/docSplit';
import type { DraftImage } from '../../core/admin/model';
import { docFromText, type DocSelection, type RichDoc } from '../../core/admin/richDoc';
import { t, tf } from '../../core/i18n';
import { PictureCard } from './PictureCard';
import { RichBox } from './RichBox';
import { RichToolbar } from './RichToolbar';
import { useRichDoc } from './useRichDoc';
import './ChapterWindow.css';

// The chapter window of the Admin page (P10 T11n step C1, rebuilt in T11o step O2; DECISIONS Q26, owner mock-ups of 2026-11-22):
// ONE toolbar over dashed boxes: Title (optional, one line), Subtitle (one line) and the Content. Since pictures sit INSIDE the text, the
// Content is a list of `items` (core/admin/chapterSlots.ts): a text box (a "slot"), then a picture card, then a text box, ... ending with
// a text box. There is always one more text box than pictures, so there is always a place to type before and after every picture.
// Every text box owns its text and its undo history, starting from the stored string it is given when it opens, and tells the parent
// only after a real edit (never when the window opens). The ONE toolbar is drawn into a host at the top by the box that has (or last
// had) the focus, so it always works on that box. When a picture is added or removed the text boxes start again from the new `items`.
// To open ANOTHER chapter give the window another `chapterKey`: everything starts again from the props.

/** Where a picture goes when the toolbar's Add button is pressed: inside the text slot `key`, whose text is cut in two at the caret. */
export interface PictureSpot extends PictureSplit {
  /** The slot (`chapterToItems` key) that gets the picture. */
  key: string;
}

export interface ChapterWindowProps {
  /** Identifies the chapter that is open. A new key resets all boxes (and their undo history) from the props. */
  chapterKey: string;
  /** Stored string of the title box (marks and brace spans). */
  title: string;
  /** Stored string of the subtitle box. */
  subtitle: string;
  /** The content in reading order: slot, picture, slot, ..., slot (`chapterToItems`). */
  items: readonly ContentItem[];
  /** The pictures of the draft; the cards take their thumbnails from here. */
  images?: readonly DraftImage[];
  onTitleChange: (text: string) => void;
  onSubtitleChange: (text: string) => void;
  /** The text of one slot changed (`key` is the slot key of `chapterToItems`). */
  onSlotChange: (key: string, text: string) => void;
  onPictureChange: (id: string, patch: PicturePatch) => void;
  onPictureRemove: (id: string) => void;
  /**
   * The Add (picture) button of the toolbar. The window says where the picture goes: the text box that has the focus, cut at its caret
   * (from the title or the subtitle: the top of the content). Choosing the file and putting the picture in is the parent's job.
   * Without it the button is off.
   */
  onAddPicture?: (spot: PictureSpot) => void;
  /** The content of the toolbar's Settings panel. Without it the Settings button is off. */
  settings?: ReactNode;
  disabled?: boolean;
}

const NO_IMAGES: readonly DraftImage[] = [];

const TITLE_BOX = 'title';
const SUBTITLE_BOX = 'subtitle';
const slotBox = (key: string) => `slot:${key}`;

/** Calls `report` with the text only after it really changed since the box opened. */
function useReportOnEdit(text: string, report: (text: string) => void) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === null) {
      last.current = text;
      return;
    }
    if (last.current === text) return;
    last.current = text;
    report(text);
  }, [text, report]);
}

interface TextBoxProps {
  boxId: string;
  className: string;
  /** The stored string the box starts from. */
  initial: string;
  label: string;
  placeholder: string;
  singleLine: boolean;
  disabled: boolean;
  /** This box is the one the toolbar works on. */
  active: boolean;
  /** Where the toolbar is drawn (`null` until the window has mounted). */
  host: HTMLElement | null;
  onActivate: (id: string) => void;
  onText: (text: string) => void;
  onAddPicture: ((spot: PictureSpot) => void) | undefined;
  /** Where a picture added from this box goes, given the doc and the selection of the box. */
  spotOf: (doc: RichDoc, selection: DocSelection | null) => PictureSpot;
  settings: ReactNode;
}

function TextBox({
  boxId,
  className,
  initial,
  label,
  placeholder,
  singleLine,
  disabled,
  active,
  host,
  onActivate,
  onText,
  onAddPicture,
  spotOf,
  settings,
}: TextBoxProps) {
  const controller = useRichDoc(() => docFromText(initial));
  useReportOnEdit(controller.text, onText);
  // The Add button hands over where the picture goes: this box's text cut at its caret (read when the button is pressed).
  const addPicture = onAddPicture === undefined ? undefined : () => onAddPicture(spotOf(controller.doc, controller.selection));

  return (
    <div className={className} onFocusCapture={() => onActivate(boxId)}>
      <RichBox
        label={label}
        placeholder={placeholder}
        value={controller.doc}
        selection={controller.selection}
        onChange={controller.change}
        onSelectionChange={controller.select}
        onUndo={controller.undo}
        onRedo={controller.redo}
        singleLine={singleLine}
        disabled={disabled}
      />
      {active && host !== null
        ? createPortal(
            <RichToolbar
              doc={controller.doc}
              selection={controller.selection}
              apply={controller.apply}
              disabled={disabled}
              {...(addPicture === undefined ? {} : { onAddPicture: addPicture })}
              {...(settings === undefined ? {} : { settings })}
            />,
            host,
          )
        : null}
    </div>
  );
}

function ChapterWindowBody({
  title,
  subtitle,
  items,
  images = NO_IMAGES,
  onTitleChange,
  onSubtitleChange,
  onSlotChange,
  onPictureChange,
  onPictureRemove,
  onAddPicture,
  settings,
  disabled = false,
}: Omit<ChapterWindowProps, 'chapterKey'>) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>(slotBox(START_SLOT));

  // The toolbar goes to the box that has the focus; if that box is gone (its picture was removed) it goes to the first text box.
  const slotIds = items.flatMap((item) => (item.kind === 'slot' ? [slotBox(item.key)] : []));
  const activeId = active === TITLE_BOX || active === SUBTITLE_BOX || slotIds.includes(active) ? active : slotBox(START_SLOT);
  // The text boxes start again whenever the pictures change (their texts are then different).
  const structure = items.flatMap((item) => (item.kind === 'picture' ? [item.block.id] : [])).join('|');
  const alone = items.length === 1;
  // From the title or the subtitle a picture goes to the top of the content (right under the subtitle).
  const firstItem = items[0];
  const firstText = firstItem !== undefined && firstItem.kind === 'slot' ? firstItem.text : '';
  const topSpot = (): PictureSpot => ({ key: START_SLOT, before: '', after: firstText });

  return (
    <div className="np-chapter">
      <div className="np-chapter__toolbar" ref={setHost} />
      <div className="np-chapter__window">
        <TextBox
          boxId={TITLE_BOX}
          className="np-chapter__field np-chapter__field--title"
          initial={title}
          label={t('admin.chapterWindow.titleLabel')}
          placeholder={t('admin.chapterWindow.titlePlaceholder')}
          singleLine
          disabled={disabled}
          active={activeId === TITLE_BOX}
          host={host}
          onActivate={setActive}
          onText={onTitleChange}
          onAddPicture={onAddPicture}
          spotOf={topSpot}
          settings={settings}
        />
        <TextBox
          boxId={SUBTITLE_BOX}
          className="np-chapter__field np-chapter__field--subtitle"
          initial={subtitle}
          label={t('admin.chapterWindow.subtitleLabel')}
          placeholder={t('admin.chapterWindow.subtitlePlaceholder')}
          singleLine
          disabled={disabled}
          active={activeId === SUBTITLE_BOX}
          host={host}
          onActivate={setActive}
          onText={onSubtitleChange}
          onAddPicture={onAddPicture}
          spotOf={topSpot}
          settings={settings}
        />
        {items.map((item, index) => {
          if (item.kind === 'picture') {
            const block = item.block;
            return (
              <PictureCard
                key={block.id}
                block={block}
                image={images.find((image) => image.path === block.src)}
                onChange={(patch) => onPictureChange(block.id, patch)}
                onRemove={() => onPictureRemove(block.id)}
                disabled={disabled}
              />
            );
          }
          const first = index === 0;
          return (
            <TextBox
              key={`${item.key}|${structure}`}
              boxId={slotBox(item.key)}
              className={`np-chapter__field np-chapter__field--content${alone ? ' np-chapter__field--alone' : ''}`}
              initial={item.text}
              label={first ? t('admin.chapterWindow.contentLabel') : tf('admin.chapterWindow.slotLabel', { number: index / 2 })}
              placeholder={first ? t('admin.chapterWindow.contentPlaceholder') : t('admin.chapterWindow.slotPlaceholder')}
              singleLine={false}
              disabled={disabled}
              active={activeId === slotBox(item.key)}
              host={host}
              onActivate={setActive}
              onText={(text) => onSlotChange(item.key, text)}
              onAddPicture={onAddPicture}
              spotOf={(doc, selection) => ({ key: item.key, ...splitDocText(doc, selection) })}
              settings={settings}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ChapterWindow({ chapterKey, ...rest }: ChapterWindowProps) {
  // A new key remounts the body: fresh boxes, fresh undo history, and no change is reported for merely opening a chapter.
  return <ChapterWindowBody key={chapterKey} {...rest} />;
}
