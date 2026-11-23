import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { prepareImage, type WebpEncoder } from '../../core/admin/image';
import type { DraftImage } from '../../core/admin/model';
import { browserWebpEncoder } from '../../core/admin/webpEncoder';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button } from '../../core/ui';
import { IMAGE_ERROR_TEXT, readBytes } from './imageFile';
import { imageToDataUrl } from './imageUrl';
import './BlockEditor.css';

// Cover picture of a course (P10 T7(d), SPEC D2). Controlled: the course editor owns `cover` (a path in `images`) and the
// picture list. A new pick goes through `prepareImage` (type from the bytes, size limit, safe SVG, shrink). The old cover
// stays in the list; unused pictures are dropped when the course is saved (`pruneImages`). Styles are shared with BlockEditor.css.

interface CoverFieldProps {
  cover: string | undefined;
  images: DraftImage[];
  onChange: (cover: string | undefined, images: DraftImage[]) => void;
  /** Turns a big picture into a smaller webp. The browser version is the default; tests pass a fake. */
  encodeWebp?: WebpEncoder;
  disabled?: boolean;
}

function CoverPreview({ image }: { image: DraftImage }) {
  const src = useMemo(() => imageToDataUrl(image), [image]);
  return <img className="np-block-editor__preview" src={src} alt="" />;
}

export function CoverField({ cover, images, onChange, encodeWebp = browserWebpEncoder, disabled = false }: CoverFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = disabled || working;
  const image = cover === undefined ? undefined : images.find((img) => img.path === cover);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files === null ? undefined : Array.from(input.files).shift();
    // Cleared so that choosing the same file again still counts as a change.
    input.value = '';
    if (file === undefined) return;
    setError(null);
    setNote(null);
    setWorking(true);
    const bytes = await readBytes(file);
    const result = bytes === null ? null : await prepareImage(bytes, images, encodeWebp);
    setWorking(false);
    if (result === null) {
      setError('admin.blocks.err.cannotRead');
      return;
    }
    if (!result.ok) {
      setError(IMAGE_ERROR_TEXT[result.code]);
      return;
    }
    onChange(result.image.path, [...images.filter((img) => img.path !== result.image.path), result.image]);
    if (result.shrunk) setNote(t('admin.blocks.shrunk'));
  }

  function onRemove() {
    setError(null);
    setNote(null);
    onChange(undefined, images);
  }

  return (
    <section className="np-block-editor" aria-labelledby="np-cover-heading">
      <h3 id="np-cover-heading" className="np-block-editor__heading">
        {t('admin.cover.heading')}
      </h3>
      <p className="np-block-editor__text">{t('admin.cover.hint')}</p>
      {cover === undefined && <p className="np-block-editor__text">{t('admin.cover.none')}</p>}
      {cover !== undefined && image === undefined && (
        <p className="np-block-editor__error">
          <span aria-hidden="true">! </span>
          {tf('admin.cover.missing', { path: cover })}
        </p>
      )}
      {image !== undefined && (
        <>
          <CoverPreview image={image} />
          <p className="np-block-editor__text">
            {tf('admin.blocks.imageInfo', { path: image.path, size: Math.max(1, Math.round(image.bytes.length / 1024)) })}
          </p>
        </>
      )}
      {working && (
        <p role="status" className="np-block-editor__status">
          {t('admin.blocks.working')}
        </p>
      )}
      {!working && note !== null && (
        <p role="status" className="np-block-editor__status">
          {note}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="np-block-editor__error">
          <span aria-hidden="true">! </span>
          {t(error)}
        </p>
      )}
      <div className="np-block-editor__adds">
        <Button
          variant="secondary"
          icon={cover === undefined ? <ImagePlus size={20} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" />}
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {t(cover === undefined ? 'admin.cover.choose' : 'admin.cover.replace')}
        </Button>
        {cover !== undefined && (
          <Button variant="secondary" icon={<Trash2 size={20} aria-hidden="true" />} onClick={onRemove} disabled={busy}>
            {t('admin.cover.remove')}
          </Button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label={t('admin.cover.fileLabel')}
        onChange={(e) => void onFile(e)}
      />
    </section>
  );
}
