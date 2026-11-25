import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  addAfter,
  clampIndex,
  moveBy,
  removeAt,
  updateChapterAt,
  visibleChapters,
  withoutBlankChapters,
} from '../../core/admin/chapterList';
import { joinChapters, splitChapters, type Chapter } from '../../core/admin/chapters';
import { applySlotText, chapterToItems, insertPicture, removePicture, updatePicture } from '../../core/admin/chapterSlots';
import { applyStrings, chapterToStrings } from '../../core/admin/chapterText';
import { prepareImage, type WebpEncoder } from '../../core/admin/image';
import { firstTest, replaceFirstTest, type CourseDraft, type DraftImage } from '../../core/admin/model';
import { pruneImages } from '../../core/admin/pruneImages';
import { summarizeProblems, type Problem } from '../../core/admin/problems';
import { browserWebpEncoder } from '../../core/admin/webpEncoder';
import { newId } from '../../core/content/ids';
import type { Block, CourseCard, Test } from '../../core/content/types';
import { t, type TextKey } from '../../core/i18n';
import { Button } from '../../core/ui';
import { ChapterList } from './ChapterList';
import { ChapterWindow, type PictureSpot } from './ChapterWindow';
import {
  checkCourseFields,
  courseWithFields,
  fieldsFromCourse,
  NO_FIELD_ERRORS,
  type CourseFieldErrors,
  type CourseFields,
} from './courseFields';
import { CourseSettings } from './CourseSettings';
import { IMAGE_ERROR_TEXT, readBytes } from './imageFile';
import { ProblemSummary } from './ProblemSummary';
import { TestEditor } from './TestEditor';
import { WindowBar } from './WindowBar';
import './BlockEditor.css';
import './CourseWorkspace.css';

// The course workspace (P10 T11n step C3a, DECISIONS Q26, owner mock-ups of 2026-11-22): it replaces the old CourseEditor.
// A switch between the parts Overview | Content | Test; for Overview and Content ONE chapter window (toolbar + Title, Subtitle and
// Content boxes, `ChapterWindow`) of the open chapter, the chapter list when Edit is on, and for Test the test editor. The toolbar's
// Settings panel holds the course details and the cover (`CourseSettings`). The bottom bar is `WindowBar` (Save, Edit, Publish off,
// Add chapter, Cancel). The files stay flat: the chapters are only a view of `blocks` (core/admin/chapters.ts), the three boxes are
// mapped by core/admin/chapterText.ts, and the chapters are joined again on Save. Pictures that nothing uses any more are dropped before
// the draft goes up, a test with no questions, no title and no picture is saved as null, a chapter with no title and nothing in it is
// left out, and Save does not go on while the course details are wrong (the friendly list says what to fix).
// Pictures inside the text (T11o): the Content is text boxes and picture cards (`chapterToItems`, `applySlotText`, `updatePicture`,
// `removePicture`); the toolbar's Add button (T11o O3) opens a file picker, the file goes through `prepareImage` like the cover, and the
// picture is put in at the caret of the box that has the focus (`insertPicture`; the box's text is cut by core/admin/docSplit.ts, from the
// title or subtitle the picture goes to the top of the content). The chosen picture joins `images`; unused ones are dropped on Save.

export interface CourseWorkspaceProps {
  draft: CourseDraft;
  busy: boolean;
  onSave: (draft: CourseDraft) => void;
  /** Publish the course of the window (P11 T5b): the same checks as Save, then the draft goes up. Left out = Publish stays off. */
  onPublish?: (draft: CourseDraft) => void;
  onCancel: () => void;
  /** Tests pass a fake; the browser version is the default of the cover and test editors. */
  encodeWebp?: WebpEncoder;
}

type ChapterPart = 'overview' | 'content';
type Part = ChapterPart | 'test';

const PARTS: Part[] = ['overview', 'content', 'test'];

/** Where the picture that is being chosen goes: the open chapter and the cut of its text. */
interface PictureTarget {
  which: ChapterPart;
  index: number;
  spot: PictureSpot;
}

const PART_TEXT: Record<Part, TextKey> = {
  overview: 'admin.editor.overview',
  content: 'admin.editor.content',
  test: 'admin.window.partTest',
};

/** An empty test (no questions, no title, no picture) is not a test at all. */
function emptyToNull(test: Test | null): Test | null {
  if (test === null) return null;
  const hasTitle = test.title !== undefined && test.title !== '';
  const hasImage = test.image !== undefined && test.image !== '';
  return test.questions.length === 0 && !hasTitle && !hasImage ? null : test;
}

/** Where the open chapter is in the new list: the same chapter object when it is still there, else the nearest position. */
function follow(next: readonly Chapter[], open: Chapter | undefined, fallback: number): number {
  const found = open === undefined ? -1 : next.indexOf(open);
  return found >= 0 ? found : clampIndex(next.length, fallback);
}

/** The problems of the course details boxes, in the same words as the other problems. */
function fieldProblems(errors: CourseFieldErrors): Problem[] {
  const out: Problem[] = [];
  if (errors.title !== null) out.push({ key: 'admin.problem.courseTitle' });
  if (errors.order !== null) out.push({ key: 'admin.problem.courseOrder' });
  return out;
}

/** `first` followed by the problems of `rest` that `first` does not already say. */
function mergeProblems(first: Problem[], rest: Problem[]): Problem[] {
  const keys = new Set(first.map((problem) => problem.key));
  return [...first, ...rest.filter((problem) => !keys.has(problem.key))];
}

export function CourseWorkspace({ draft, busy, onSave, onPublish, onCancel, encodeWebp }: CourseWorkspaceProps) {
  const [fields, setFields] = useState<CourseFields>(() => fieldsFromCourse(draft.course));
  const [fieldErrors, setFieldErrors] = useState<CourseFieldErrors>(NO_FIELD_ERRORS);
  const [cover, setCover] = useState<string | undefined>(draft.course.cover);
  const [chapters, setChapters] = useState<Record<ChapterPart, Chapter[]>>(() => ({
    overview: splitChapters(draft.overview),
    content: splitChapters(draft.content),
  }));
  const [positions, setPositions] = useState<Record<ChapterPart, number>>({ overview: 0, content: 0 });
  const [part, setPart] = useState<Part>('overview');
  const [listOpen, setListOpen] = useState(false);
  /** Goes up whenever a part or a chapter is opened, added, moved or deleted, so the chapter window starts fresh. */
  const [version, setVersion] = useState(0);
  const [test, setTest] = useState<Test | null>(firstTest(draft));
  const [images, setImages] = useState<DraftImage[]>(draft.images);
  const [problems, setProblems] = useState<Problem[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pictureTarget = useRef<PictureTarget | null>(null);
  const [pictureWorking, setPictureWorking] = useState(false);
  const [pictureError, setPictureError] = useState<TextKey | null>(null);
  const [pictureNote, setPictureNote] = useState<string | null>(null);

  const encoder = encodeWebp === undefined ? {} : { encodeWebp };
  const chapterPart: ChapterPart | null = part === 'test' ? null : part;
  const shown = chapterPart === null ? [] : visibleChapters(chapters[chapterPart]);
  const current = chapterPart === null ? 0 : clampIndex(shown.length, positions[chapterPart]);
  const openChapter = shown[current];
  const label = t(PART_TEXT[part]);

  function showPart(next: Part) {
    setPart(next);
    setListOpen(false);
    setVersion((v) => v + 1);
  }

  /** Puts a new chapter list (and the open position) into one part. */
  function put(which: ChapterPart, next: Chapter[], index: number) {
    setChapters((all) => ({ ...all, [which]: next }));
    setPositions((all) => ({ ...all, [which]: index }));
    setVersion((v) => v + 1);
  }

  function openAt(index: number) {
    if (chapterPart === null) return;
    setPositions((all) => ({ ...all, [chapterPart]: index }));
    setVersion((v) => v + 1);
  }

  function addChapter() {
    if (chapterPart === null) return;
    const result = addAfter(chapters[chapterPart], current);
    put(chapterPart, result.chapters, result.index);
  }

  function removeAtIndex(index: number) {
    if (chapterPart === null) return;
    const result = removeAt(chapters[chapterPart], index);
    put(chapterPart, result.chapters, index === current ? result.index : follow(result.chapters, openChapter, result.index));
  }

  function moveAtIndex(index: number, delta: -1 | 1) {
    if (chapterPart === null) return;
    const result = moveBy(chapters[chapterPart], index, delta);
    put(chapterPart, result.chapters, index === current ? result.index : follow(result.chapters, openChapter, current));
  }

  /**
   * The person edited the open chapter (typed in a box or changed a picture): no tidy-up, so nothing jumps while they write.
   * An edit that changes nothing returns the same chapter and changes nothing.
   */
  function editChapter(which: ChapterPart, index: number, edit: (chapter: Chapter) => Chapter) {
    setChapters((all) => {
      const list = all[which];
      const base = visibleChapters(list)[index];
      if (base === undefined) return all;
      const updated = edit(base);
      return updated === base ? all : { ...all, [which]: updateChapterAt(list, index, updated) };
    });
  }

  /** The toolbar's Add button: remember where the picture goes (open chapter and cut of the text), then let the person choose a file. */
  function choosePicture(spot: PictureSpot) {
    if (chapterPart === null) return;
    pictureTarget.current = { which: chapterPart, index: current, spot };
    setPictureError(null);
    setPictureNote(null);
    fileInput.current?.click();
  }

  /** A file was chosen: check it like the cover (type, size, safe SVG, shrink) and put it into the text at the remembered place. */
  async function onPictureFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files === null ? undefined : Array.from(input.files).shift();
    // Cleared so that choosing the same file again still counts as a change.
    input.value = '';
    const target = pictureTarget.current;
    pictureTarget.current = null;
    if (file === undefined || target === null) return;
    setPictureError(null);
    setPictureNote(null);
    setPictureWorking(true);
    const bytes = await readBytes(file);
    const result = bytes === null ? null : await prepareImage(bytes, images, encodeWebp ?? browserWebpEncoder);
    setPictureWorking(false);
    if (result === null) {
      setPictureError('admin.blocks.err.cannotRead');
      return;
    }
    if (!result.ok) {
      setPictureError(IMAGE_ERROR_TEXT[result.code]);
      return;
    }
    const image = result.image;
    const block: Block = { id: newId('blk'), type: 'image', src: image.path, alt: '' };
    setImages((all) => [...all.filter((item) => item.path !== image.path), image]);
    editChapter(target.which, target.index, (chapter) => insertPicture(chapter, target.spot.key, target.spot, block));
    if (result.shrunk) setPictureNote(t('admin.blocks.shrunk'));
  }

  /** The draft as it is in the window, or null (and the friendly list of what to fix) when it is not valid. Save and Publish share it. */
  function collect(): CourseDraft | null {
    const checked = checkCourseFields(fields);
    const errors = checked.ok ? NO_FIELD_ERRORS : checked.errors;
    setFieldErrors(errors);
    const base: CourseCard = { id: draft.course.id, title: draft.course.title, order: draft.course.order };
    if (cover !== undefined) base.cover = cover;
    const next: CourseDraft = {
      ...draft,
      course: checked.ok ? courseWithFields(base, checked) : base,
      overview: joinChapters(withoutBlankChapters(chapters.overview)),
      content: joinChapters(withoutBlankChapters(chapters.content)),
      tests: replaceFirstTest(draft.tests, emptyToNull(test)),
      images,
    };
    const final: CourseDraft = { ...next, images: pruneImages(next) };
    // Nothing that is not valid goes up: the developer sees a friendly list of what to fix (SPEC D5).
    const found = summarizeProblems(final);
    const listed = checked.ok ? found : mergeProblems(fieldProblems(errors), found);
    setProblems(listed);
    return listed.length === 0 ? final : null;
  }

  function save() {
    const ready = collect();
    if (ready !== null) onSave(ready);
  }

  function publishNow() {
    const ready = collect();
    if (ready !== null && onPublish !== undefined) onPublish(ready);
  }

  const settings: ReactNode = (
    <CourseSettings
      fields={fields}
      errors={fieldErrors}
      onChange={(next) => {
        setFields(next);
        setFieldErrors(NO_FIELD_ERRORS);
      }}
      cover={cover}
      images={images}
      onCoverChange={(nextCover, nextImages) => {
        setCover(nextCover);
        setImages(nextImages);
      }}
      disabled={busy}
      idPrefix="np-workspace"
      {...encoder}
    />
  );

  let main: ReactNode = null;
  if (chapterPart === null) {
    main = (
      <TestEditor
        test={test}
        images={images}
        onChange={(nextTest, nextImages) => {
          setTest(nextTest);
          setImages(nextImages);
        }}
        disabled={busy}
        {...encoder}
      />
    );
  } else if (openChapter !== undefined) {
    main = (
      <>
        <ChapterWindow
          chapterKey={`${chapterPart}-${current}-${version}`}
          title={chapterToStrings(openChapter).title}
          subtitle={chapterToStrings(openChapter).subtitle}
          items={chapterToItems(openChapter)}
          images={images}
          onTitleChange={(title) => editChapter(chapterPart, current, (c) => applyStrings(c, { ...chapterToStrings(c), title }))}
          onSubtitleChange={(subtitle) =>
            editChapter(chapterPart, current, (c) => applyStrings(c, { ...chapterToStrings(c), subtitle }))
          }
          onSlotChange={(key, text) => editChapter(chapterPart, current, (c) => applySlotText(c, key, text))}
          onPictureChange={(id, patch) => editChapter(chapterPart, current, (c) => updatePicture(c, id, patch))}
          onPictureRemove={(id) => editChapter(chapterPart, current, (c) => removePicture(c, id))}
          onAddPicture={choosePicture}
          settings={settings}
          disabled={busy || pictureWorking}
        />
        {pictureWorking && (
          <p role="status" className="np-block-editor__status">
            {t('admin.blocks.working')}
          </p>
        )}
        {!pictureWorking && pictureNote !== null && (
          <p role="status" className="np-block-editor__status">
            {pictureNote}
          </p>
        )}
        {pictureError !== null && (
          <p role="alert" className="np-block-editor__error">
            <span aria-hidden="true">! </span>
            {t(pictureError)}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label={t('admin.picture.fileLabel')}
          onChange={(e) => void onPictureFile(e)}
        />
        {listOpen && (
          <ChapterList
            label={label}
            chapters={shown}
            current={current}
            onOpen={(index) => {
              setListOpen(false);
              openAt(index);
            }}
            onMove={moveAtIndex}
            onRemove={removeAtIndex}
            disabled={busy}
          />
        )}
      </>
    );
  }

  // Edit and Add chapter belong to the parts that have chapters; the Test part leaves them out.
  const chapterActions =
    chapterPart === null ? {} : { onAddChapter: addChapter, onToggleEdit: () => setListOpen((open) => !open), editOpen: listOpen };
  const publishAction = onPublish === undefined ? {} : { onPublish: publishNow };

  return (
    <div className="np-workspace">
      <div className="np-workspace__parts" role="group" aria-label={t('admin.window.partsLabel')} data-np-check>
        {PARTS.map((id) => (
          <Button
            key={id}
            variant={part === id ? 'primary' : 'secondary'}
            aria-pressed={part === id}
            onClick={() => showPart(id)}
            disabled={busy}
          >
            {t(PART_TEXT[id])}
          </Button>
        ))}
      </div>
      <div className="np-workspace__main">{main}</div>
      <ProblemSummary problems={problems} />
      <WindowBar busy={busy} onSave={save} onCancel={onCancel} {...chapterActions} {...publishAction} />
    </div>
  );
}
