import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedCourse } from '../../core/content/loader';
import type { Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { CourseScreen } from './CourseScreen';

// P10 T11t (d): the Test tile is also open when the course has tests in tests/<id>.json (found through the manifest) and no
// old test.json. loadCourse and findCourseTests are mocked; CourseScreen.test.tsx covers the rest of the screen.
const { loadMock, findMock } = vi.hoisted(() => ({ loadMock: vi.fn(), findMock: vi.fn() }));

vi.mock('../../core/content/loader', () => ({ loadCourse: loadMock }));
vi.mock('../../core/content/courseTests', () => ({ findCourseTests: findMock }));

const ID = 'crs_aaaaaaaa';

function testOf(id: string): Test {
  return {
    id,
    questionsPerGame: 1,
    questions: [{ id: 'qst_aaaaaaaa', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }],
  };
}

const noTest: LoadedCourse = {
  card: { state: 'ready', value: { id: ID, title: 'General Science', order: 1 } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: { state: 'empty' },
};

const oldTest: LoadedCourse = { ...noTest, test: { state: 'ready', value: testOf('tst_aaaaaaaa') } };

function SectionStub() {
  const { courseId, section } = useParams();
  return <p>{`SECTION ${section ?? ''} OF ${courseId ?? ''}`}</p>;
}

function renderCourse() {
  return render(
    <MemoryRouter initialEntries={[`/course/${ID}`]}>
      <Routes>
        <Route path="/course/:courseId" element={<CourseScreen />} />
        <Route path="/course/:courseId/:section" element={<SectionStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const testTile = () => screen.getByText(t('course.tile.test')).closest('button') as HTMLButtonElement;

beforeEach(() => {
  loadMock.mockReset();
  findMock.mockReset();
  findMock.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe('CourseScreen: tests found through the manifest', () => {
  it('opens the Test tile when there are tests in tests/ but no old test.json', async () => {
    loadMock.mockResolvedValue(noTest);
    findMock.mockResolvedValue([testOf('tst-aaaa0001'), testOf('tst-bbbb0002')]);
    renderCourse();

    await screen.findByRole('heading', { level: 1, name: 'General Science' });
    expect(testTile()).not.toHaveAttribute('aria-disabled');
    expect(findMock).toHaveBeenCalledWith(ID);

    fireEvent.click(testTile());
    expect(await screen.findByText(`SECTION test OF ${ID}`)).toBeInTheDocument();
  });

  it('keeps the Test tile off when the course has no test at all', async () => {
    loadMock.mockResolvedValue(noTest);
    renderCourse();

    await screen.findByRole('heading', { level: 1, name: 'General Science' });
    expect(testTile()).toHaveAttribute('aria-disabled', 'true');
    expect(findMock).toHaveBeenCalledWith(ID);
  });

  it('does not look for more tests when the old test.json is ready', async () => {
    loadMock.mockResolvedValue(oldTest);
    renderCourse();

    await screen.findByRole('heading', { level: 1, name: 'General Science' });
    expect(testTile()).not.toHaveAttribute('aria-disabled');
    expect(findMock).not.toHaveBeenCalled();
  });

  it('a search for tests that fails only leaves the Test tile off: the course itself stays open', async () => {
    loadMock.mockResolvedValue(noTest);
    findMock.mockRejectedValue(new Error('boom'));
    renderCourse();

    expect(await screen.findByRole('heading', { level: 1, name: 'General Science' })).toBeInTheDocument();
    expect(testTile()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t('course.tile.report')).closest('button')).not.toHaveAttribute('aria-disabled');
  });
});
