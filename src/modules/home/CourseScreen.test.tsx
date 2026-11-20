import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import { t } from '../../core/i18n';
import { CourseScreen } from './CourseScreen';

// loadCourse is mocked: this file tests the SCREEN. The real loading is covered in core/content/loader.test.ts.
const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({ loadCourse: loadMock }));

const ID = 'crs_aaaaaaaa';
const CARD = { id: ID, title: 'General Science', description: 'Physics and more', order: 1 };

const blocks = [{ id: 'blk_aaaaaaaa', type: 'text' as const, text: 'Hello' }];
const test = {
  id: 'tst_aaaaaaaa',
  questionsPerGame: 1,
  questions: [{ id: 'qst_aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'] as [string, string, string, string], correctIndex: 0 as const }],
};

const fullCourse: LoadedCourse = {
  card: { state: 'ready', value: CARD },
  overview: { state: 'ready', value: blocks },
  content: { state: 'ready', value: blocks },
  test: { state: 'ready', value: test },
};

const emptyCourse: LoadedCourse = {
  card: { state: 'ready', value: { ...CARD, title: 'Empty Course' } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: { state: 'empty' },
};

function SectionStub() {
  const { courseId, section } = useParams();
  return <p>{`SECTION ${section ?? ''} OF ${courseId ?? ''}`}</p>;
}

function renderCourse(path = `/course/${ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>HOME SCREEN</p>} />
        <Route path="/course/:courseId" element={<CourseScreen />} />
        <Route path="/course/:courseId/:section" element={<SectionStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const tile = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement;
const TILE_NAMES = [t('course.tile.overview'), t('course.tile.content'), t('course.tile.test'), t('course.tile.report')];

beforeEach(() => {
  loadMock.mockReset();
});

describe('CourseScreen: a full course', () => {
  it('shows the course title as the only h1 and exactly four open tiles', async () => {
    loadMock.mockResolvedValue(fullCourse);
    renderCourse();
    expect(await screen.findByRole('heading', { level: 1, name: 'General Science' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Physics and more')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    for (const name of TILE_NAMES) expect(tile(name)).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(t('course.unavailable'))).not.toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith(ID);
  });

  it('each tile opens its own section of this course', async () => {
    loadMock.mockResolvedValue(fullCourse);
    renderCourse();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(tile(t('course.tile.test')));
    expect(await screen.findByText(`SECTION test OF ${ID}`)).toBeInTheDocument();
  });

  it('Back returns to Home', async () => {
    loadMock.mockResolvedValue(fullCourse);
    renderCourse();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: t('course.back') }));
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });
});

describe('CourseScreen: a course with empty sections', () => {
  it('Overview, Content and Test show the Gujarati message and cannot be opened; Report stays open', async () => {
    loadMock.mockResolvedValue(emptyCourse);
    renderCourse();
    await screen.findByRole('heading', { level: 1, name: 'Empty Course' });
    expect(screen.getAllByText(t('course.unavailable'))).toHaveLength(3);
    for (const name of [t('course.tile.overview'), t('course.tile.content'), t('course.tile.test')]) {
      const disabled = tile(name);
      expect(disabled).toHaveAttribute('aria-disabled', 'true');
      const noteId = disabled.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(noteId)).toHaveTextContent(t('course.unavailable'));
      fireEvent.click(disabled);
    }
    expect(screen.queryByText(/^SECTION /)).not.toBeInTheDocument();
    expect(tile(t('course.tile.report'))).not.toHaveAttribute('aria-disabled');
  });

  it('Report opens even when everything else is empty', async () => {
    loadMock.mockResolvedValue(emptyCourse);
    renderCourse();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(tile(t('course.tile.report')));
    expect(await screen.findByText(`SECTION report OF ${ID}`)).toBeInTheDocument();
  });

  it('a broken section is treated like an empty one', async () => {
    loadMock.mockResolvedValue({ ...fullCourse, content: { state: 'invalid', errors: ['bad'] } });
    renderCourse();
    await screen.findByRole('heading', { level: 1 });
    expect(tile(t('course.tile.content'))).toHaveAttribute('aria-disabled', 'true');
    expect(tile(t('course.tile.overview'))).not.toHaveAttribute('aria-disabled');
    expect(screen.getAllByText(t('course.unavailable'))).toHaveLength(1);
  });
});

describe('CourseScreen: loading and unavailable', () => {
  it('shows a loading status first and no tile buttons', () => {
    loadMock.mockReturnValue(new Promise(() => undefined));
    renderCourse();
    expect(screen.getByRole('status')).toHaveTextContent(t('course.loading'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('an unknown or broken course shows the not-available state with Back', async () => {
    loadMock.mockResolvedValue({ ...emptyCourse, card: { state: 'invalid', errors: ['bad'] } });
    renderCourse('/course/crs_unknown1');
    expect(await screen.findByRole('heading', { level: 1, name: t('course.notFound.title') })).toBeInTheDocument();
    expect(screen.getByText(t('course.unavailable'))).toBeInTheDocument();
    expect(screen.queryByText(t('course.tile.report'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('course.back') }));
    expect(await screen.findByText('HOME SCREEN')).toBeInTheDocument();
  });

  it('a course with no card file (empty) is not available either', async () => {
    loadMock.mockResolvedValue({ ...emptyCourse, card: { state: 'empty' } });
    renderCourse();
    expect(await screen.findByRole('heading', { level: 1, name: t('course.notFound.title') })).toBeInTheDocument();
  });

  it('a loader exception is the not-available state, never a crash', async () => {
    loadMock.mockRejectedValue(new Error('boom'));
    renderCourse();
    expect(await screen.findByRole('heading', { level: 1, name: t('course.notFound.title') })).toBeInTheDocument();
  });
});
