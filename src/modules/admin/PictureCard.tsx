import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus, Trash2 } from 'lucide-react';
import type { PicturePatch } from '../../core/admin/chapterSlots';
import type { DraftImage } from '../../core/admin/model';
import { widthHandleSide } from '../../core/admin/pictureDrag';
import { IMAGE_HEIGHT_RANGE, IMAGE_WIDTH_RANGE, type Block, type ImageAlign } from '../../core/content/types';
import { t, type TextKey } from '../../core/i18n';
import { Button } from '../../core/ui';
import { imageToDataUrl } from './imageUrl';
import { usePictureDrag } from './usePictureDrag';
import './PictureCard.css';

// The card of ONE picture between two text boxes of the chapter window (P10 T11o steps O2 + O4b, DECISIONS Q26 d).
// Controlled: the card shows the image block it is given and reports every change as a `PicturePatch` (core/admin/chapterSlots.ts clamps
// the numbers to the allowed ranges). Position: Left / Centre / Right (Centre = no `align` field). Width and height are whole percents; an
// empty box means "natural size" / "keep the proportions". The number box applies its text when it loses the focus or on Enter, so typing
// "5" on the way to "50" is not cut to 10 half way; the - / + buttons change the number by 10 at once.
// The picture is drawn at its real share of the column (the "frame" inside the "stage"). Dragging a side edge changes the width, the bottom
// edge the height, and sliding the picture left or right moves it (usePictureDrag.ts); the handles are for the pointer only (they are
// hidden from screen readers and not in the tab order), the buttons and number boxes stay for the keyboard.

export interface PictureCardProps {
  /** The image block. */
  block: Block;
  /** The bytes of the picture for the thumbnail. `undefined` = the file is not in the draft. */
  image: DraftImage | undefined;
  onChange: (patch: PicturePatch) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const ALIGNS: ReadonlyArray<{ id: ImageAlign; text: TextKey }> = [
  { id: 'left', text: 'admin.picture.alignLeft' },
  { id: 'center', text: 'admin.picture.alignCenter' },
  { id: 'right', text: 'admin.picture.alignRight' },
];

const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

/** How much one press of - / + changes a size, in percent. */
const STEP = 10;

/**
 * The picture. `height` is a percent of the natural height: once the picture is loaded its natural size is known, and the stretched look
 * is set through the custom property `--np-pic-aspect` (the same idea as the reader, modules/reader/BlockView.tsx).
 */
function Thumb({ image, height }: { image: DraftImage; height: number | undefined }) {
  const src = useMemo(() => imageToDataUrl(image), [image]);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const style =
    height !== undefined && natural !== null
      ? ({ '--np-pic-aspect': `${natural.width} / ${Number(((natural.height * height) / 100).toFixed(2))}` } as CSSProperties)
      : null;
  return (
    <img
      className={style === null ? 'np-picture__thumb' : 'np-picture__thumb np-picture__thumb--stretched'}
      src={src}
      alt=""
      draggable={false}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) setNatural({ width: naturalWidth, height: naturalHeight });
      }}
      {...(style === null ? {} : { style })}
    />
  );
}

interface PercentFieldProps {
  id: string;
  label: string;
  smallerLabel: string;
  biggerLabel: string;
  /** The number now, or `undefined` while the field is empty. */
  value: number | undefined;
  range: { min: number; max: number };
  /** Where the buttons start counting while the field is empty. */
  start: number;
  disabled: boolean;
  /** A number (the caller clamps it) or `null` for an empty box. */
  onCommit: (value: number | null) => void;
}

function PercentField({ id, label, smallerLabel, biggerLabel, value, range, start, disabled, onCommit }: PercentFieldProps) {
  // `null` = show the number of the picture; a string = the person is typing.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));

  function commit() {
    if (draft === null) return;
    setDraft(null);
    const text = draft.trim();
    if (text === '') {
      onCommit(null);
      return;
    }
    const number = Number(text);
    if (Number.isFinite(number)) onCommit(number);
  }

  function step(delta: number) {
    setDraft(null);
    onCommit((value ?? start) + delta);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit();
  }

  return (
    <div className="np-picture__field">
      <label className="np-picture__label" htmlFor={id}>
        {label}
      </label>
      <div className="np-picture__stepper">
        <button
          type="button"
          className="np-picture__step"
          aria-label={smallerLabel}
          onClick={() => step(-STEP)}
          disabled={disabled || (value !== undefined && value <= range.min)}
        >
          <Minus size={20} aria-hidden="true" />
        </button>
        <input
          id={id}
          className="np-picture__number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          placeholder={t('admin.picture.autoPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="np-picture__step"
          aria-label={biggerLabel}
          onClick={() => step(STEP)}
          disabled={disabled || (value !== undefined && value >= range.max)}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function PictureCard({ block, image, onChange, onRemove, disabled = false }: PictureCardProps) {
  const base = `np-picture-${block.id}`;
  const drag = usePictureDrag(block, onChange, disabled);
  const align = drag.align ?? 'center';

  return (
    <section className="np-picture" aria-label={t('admin.picture.cardLabel')} data-np-picture={block.id}>
      {image === undefined ? (
        <p className="np-picture__missing">
          <span aria-hidden="true">! </span>
          {t('admin.picture.missing')}
        </p>
      ) : (
        <>
          <div className="np-picture__stage" ref={drag.stageRef}>
            <div
              ref={drag.frameRef}
              className={`np-picture__frame np-picture__frame--${align}${disabled ? ' np-picture__frame--disabled' : ''}`}
              style={{ width: `${drag.width ?? 100}%` }}
              onPointerDown={(event) => drag.begin('align', event)}
              {...(drag.dragging === null ? {} : { 'data-np-dragging': drag.dragging })}
            >
              <Thumb image={image} height={drag.height} />
              {disabled ? null : (
                <>
                  <div
                    className={`np-picture__handle np-picture__handle--width np-picture__handle--${widthHandleSide(drag.align)}`}
                    data-np-handle="width"
                    aria-hidden="true"
                    onPointerDown={(event) => drag.begin('width', event)}
                  />
                  <div
                    className="np-picture__handle np-picture__handle--height"
                    data-np-handle="height"
                    aria-hidden="true"
                    onPointerDown={(event) => drag.begin('height', event)}
                  />
                </>
              )}
            </div>
          </div>
          {disabled ? null : <p className="np-picture__hint">{t('admin.picture.dragHint')}</p>}
        </>
      )}

      <div className="np-picture__field">
        <span className="np-picture__label" id={`${base}-align`}>
          {t('admin.picture.alignLabel')}
        </span>
        <div className="np-picture__aligns" role="group" aria-labelledby={`${base}-align`} data-np-check>
          {ALIGNS.map(({ id, text }) => {
            const Icon = ALIGN_ICON[id];
            return (
              <Button
                key={id}
                variant={align === id ? 'primary' : 'secondary'}
                aria-pressed={align === id}
                icon={<Icon size={20} aria-hidden="true" />}
                onClick={() => onChange({ align: id === 'center' ? null : id })}
                disabled={disabled}
              >
                {t(text)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="np-picture__sizes" data-np-check>
        <PercentField
          id={`${base}-width`}
          label={t('admin.picture.widthLabel')}
          smallerLabel={t('admin.picture.narrower')}
          biggerLabel={t('admin.picture.wider')}
          value={drag.width}
          range={IMAGE_WIDTH_RANGE}
          start={100}
          disabled={disabled}
          onCommit={(width) => onChange({ width })}
        />
        <PercentField
          id={`${base}-height`}
          label={t('admin.picture.heightLabel')}
          smallerLabel={t('admin.picture.shorter')}
          biggerLabel={t('admin.picture.taller')}
          value={drag.height}
          range={IMAGE_HEIGHT_RANGE}
          start={100}
          disabled={disabled}
          onCommit={(height) => onChange({ height })}
        />
      </div>

      <div className="np-picture__field">
        <label className="np-picture__label" htmlFor={`${base}-alt`}>
          {t('admin.picture.altLabel')}
        </label>
        <input
          id={`${base}-alt`}
          className="np-picture__alt"
          type="text"
          autoComplete="off"
          value={block.alt ?? ''}
          onChange={(e) => onChange({ alt: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="np-picture__actions">
        <Button variant="secondary" icon={<Trash2 size={20} aria-hidden="true" />} onClick={onRemove} disabled={disabled}>
          {t('admin.picture.remove')}
        </Button>
      </div>
    </section>
  );
}
