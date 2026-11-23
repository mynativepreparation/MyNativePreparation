import { useMemo, useRef, useState, useId, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { prepareImage, type ImageErrorCode, type WebpEncoder } from '../../core/admin/image';
import { createTest, type DraftImage } from '../../core/admin/model';
import { browserWebpEncoder } from '../../core/admin/webpEncoder';
import type { Question, Test } from '../../core/content/types';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card, TextField } from '../../core/ui';
import { TestImport } from './TestImport';
import './BlockEditor.css';

// Test editor (P10 T8(b), SPEC D4 / D7). Controlled: the course editor owns `test` (null = no test yet) and the picture list.
//  - `TestImport` adds questions from pasted / loaded text; they are APPENDED with new ids.
//  - "Questions per game" must be a whole number of 1 or more; a bad value shows a friendly line and is NOT sent up (the
//    last good value stays in the test). Nothing is clamped silently.
//  - Optional title and picture (picked through `prepareImage`; an unused old picture is dropped when the course is saved).
//  - Every question: text, 4 options, which one is correct (radio), optional explanation, move up / down, remove.
// Question numbers are part of every control name. The student never sees which option was bold: only `correctIndex` is stored.

interface TestEditorProps {
  test: Test | null;
  images: DraftImage[];
  onChange: (test: Test, images: DraftImage[]) => void;
  /** Turns a big picture into a smaller webp. The browser version is the default; tests pass a fake. */
  encodeWebp?: WebpEncoder;
  disabled?: boolean;
}

interface Patch {
  title?: string | null;
  image?: string | null;
  questionsPerGame?: number;
  questions?: Question[];
}

const OPTION_INDEXES = [0, 1, 2, 3] as const;

const IMAGE_ERROR_TEXT: Record<ImageErrorCode, TextKey> = {
  unsupported_type: 'admin.blocks.err.unsupported',
  unsafe_svg: 'admin.blocks.err.unsafeSvg',
  too_large: 'admin.blocks.err.tooLarge',
  cannot_read: 'admin.blocks.err.cannotRead',
};

/** The test with a few parts changed; an empty title or picture is left out of the result. */
function build(base: Test, patch: Patch): Test {
  const next: Test = {
    id: base.id,
    questionsPerGame: patch.questionsPerGame ?? base.questionsPerGame,
    questions: patch.questions ?? base.questions,
  };
  const title = patch.title === undefined ? base.title : patch.title;
  if (title !== undefined && title !== null && title !== '') next.title = title;
  const image = patch.image === undefined ? base.image : patch.image;
  if (image !== undefined && image !== null && image !== '') next.image = image;
  return next;
}

function withExplanation(q: Question, text: string): Question {
  const next: Question = { id: q.id, text: q.text, options: q.options, correctIndex: q.correctIndex };
  if (text !== '') next.explanation = text;
  return next;
}

function toDataUrl(image: DraftImage): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < image.bytes.length; i += step) {
    binary += String.fromCharCode(...Array.from(image.bytes.subarray(i, i + step)));
  }
  return `data:${image.mime};base64,${btoa(binary)}`;
}

async function readBytes(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function Preview({ image }: { image: DraftImage }) {
  const src = useMemo(() => toDataUrl(image), [image]);
  return <img className="np-block-editor__preview" src={src} alt="" />;
}

export function TestEditor({ test, images, onChange, encodeWebp = browserWebpEncoder, disabled = false }: TestEditorProps) {
  const baseId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  // A stable empty test for the time before the first change, so its id does not change on every render.
  const [fresh] = useState(() => createTest());
  const base = test ?? fresh;
  const questions = base.questions;
  const [perGame, setPerGame] = useState(String(base.questionsPerGame));
  const [perGameBad, setPerGameBad] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = disabled || working;
  const image = base.image === undefined ? undefined : images.find((img) => img.path === base.image);

  function emit(patch: Patch, nextImages: DraftImage[] = images) {
    onChange(build(base, patch), nextImages);
  }

  function onPerGame(value: string) {
    setPerGame(value);
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed) && Number(trimmed) >= 1) {
      setPerGameBad(false);
      emit({ questionsPerGame: Number(trimmed) });
    } else {
      setPerGameBad(true);
    }
  }

  function editQuestion(id: string, change: (q: Question) => Question) {
    emit({ questions: questions.map((q) => (q.id === id ? change(q) : q)) });
  }

  function setOption(id: string, k: 0 | 1 | 2 | 3, value: string) {
    editQuestion(id, (q) => {
      const options: Question['options'] = [...q.options];
      options[k] = value;
      return { ...q, options };
    });
  }

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= questions.length) return;
    const next = questions.slice();
    const moved = next.splice(index, 1);
    next.splice(to, 0, ...moved);
    emit({ questions: next });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files === null ? undefined : Array.from(input.files).shift();
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
    emit({ image: result.image.path }, [...images.filter((img) => img.path !== result.image.path), result.image]);
    if (result.shrunk) setNote(t('admin.blocks.shrunk'));
  }

  return (
    <section className="np-block-editor" aria-labelledby={`${baseId}-heading`}>
      <h3 id={`${baseId}-heading`} className="np-block-editor__heading">
        {t('admin.testEditor.heading')}
      </h3>
      <TestImport onAdd={(added) => emit({ questions: [...questions, ...added] })} disabled={busy} />
      <TextField
        label={t('admin.testEditor.perGame')}
        hint={t('admin.testEditor.perGameHint')}
        value={perGame}
        onChange={(e) => onPerGame(e.target.value)}
        error={perGameBad ? t('admin.testEditor.perGameErr') : ''}
        inputMode="numeric"
        autoComplete="off"
        disabled={busy}
      />
      <TextField
        label={t('admin.testEditor.titleLabel')}
        value={base.title ?? ''}
        onChange={(e) => emit({ title: e.target.value })}
        autoComplete="off"
        disabled={busy}
      />
      <div className="np-block-editor__area-field">
        <span className="np-block-editor__label">{t('admin.testEditor.imageHeading')}</span>
        {base.image === undefined && <p className="np-block-editor__text">{t('admin.testEditor.imageNone')}</p>}
        {base.image !== undefined && image === undefined && (
          <p className="np-block-editor__error">
            <span aria-hidden="true">! </span>
            {tf('admin.testEditor.imageMissing', { path: base.image })}
          </p>
        )}
        {image !== undefined && (
          <>
            <Preview image={image} />
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
            icon={base.image === undefined ? <ImagePlus size={20} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" />}
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            {t(base.image === undefined ? 'admin.testEditor.imageChoose' : 'admin.testEditor.imageReplace')}
          </Button>
          {base.image !== undefined && (
            <Button
              variant="secondary"
              icon={<Trash2 size={20} aria-hidden="true" />}
              onClick={() => {
                setError(null);
                setNote(null);
                emit({ image: null });
              }}
              disabled={busy}
            >
              {t('admin.testEditor.imageRemove')}
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label={t('admin.testEditor.imageFile')}
          onChange={(e) => void onFile(e)}
        />
      </div>
      {questions.length === 0 ? (
        <p className="np-block-editor__text">{t('admin.testEditor.empty')}</p>
      ) : (
        <>
          <p className="np-block-editor__text">{tf('admin.testEditor.count', { count: questions.length })}</p>
          <ol className="np-block-editor__list" aria-label={t('admin.testEditor.listLabel')}>
            {questions.map((q, i) => {
              const n = i + 1;
              const textId = `${baseId}-${q.id}-text`;
              return (
                <li key={q.id}>
                  <Card className="np-block-editor__row">
                    <div className="np-block-editor__rowhead">
                      <span className="np-block-editor__kind">{tf('admin.testEditor.rowHeading', { n })}</span>
                      <div className="np-block-editor__tools">
                        <Button
                          variant="secondary"
                          icon={<ArrowUp size={20} aria-hidden="true" />}
                          aria-label={tf('admin.testEditor.upNamed', { n })}
                          onClick={() => move(i, -1)}
                          disabled={busy || i === 0}
                        >
                          {t('admin.blocks.up')}
                        </Button>
                        <Button
                          variant="secondary"
                          icon={<ArrowDown size={20} aria-hidden="true" />}
                          aria-label={tf('admin.testEditor.downNamed', { n })}
                          onClick={() => move(i, 1)}
                          disabled={busy || i === questions.length - 1}
                        >
                          {t('admin.blocks.down')}
                        </Button>
                        <Button
                          variant="secondary"
                          icon={<Trash2 size={20} aria-hidden="true" />}
                          aria-label={tf('admin.testEditor.removeNamed', { n })}
                          onClick={() => emit({ questions: questions.filter((x) => x.id !== q.id) })}
                          disabled={busy}
                        >
                          {t('admin.blocks.remove')}
                        </Button>
                      </div>
                    </div>
                    <div className="np-block-editor__area-field">
                      <label className="np-block-editor__label" htmlFor={textId}>
                        {tf('admin.testEditor.questionText', { n })}
                      </label>
                      <textarea
                        id={textId}
                        className="np-block-editor__area"
                        rows={3}
                        value={q.text}
                        onChange={(e) => editQuestion(q.id, (old) => ({ ...old, text: e.target.value }))}
                        disabled={busy}
                      />
                    </div>
                    {OPTION_INDEXES.map((k) => (
                      <div key={k}>
                        <TextField
                          label={tf('admin.testEditor.optionNamed', { n, k: k + 1 })}
                          value={q.options[k]}
                          onChange={(e) => setOption(q.id, k, e.target.value)}
                          autoComplete="off"
                          disabled={busy}
                        />
                        <label className="np-block-editor__label">
                          <input
                            type="radio"
                            name={`${baseId}-${q.id}-correct`}
                            checked={q.correctIndex === k}
                            onChange={() => editQuestion(q.id, (old) => ({ ...old, correctIndex: k }))}
                            disabled={busy}
                          />{' '}
                          {tf('admin.testEditor.correctNamed', { n, k: k + 1 })}
                        </label>
                      </div>
                    ))}
                    <TextField
                      label={tf('admin.testEditor.explanationNamed', { n })}
                      value={q.explanation ?? ''}
                      onChange={(e) => editQuestion(q.id, (old) => withExplanation(old, e.target.value))}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </Card>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
