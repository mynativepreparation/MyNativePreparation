import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublishedDeps } from '../../core/admin/loadExisting';
import type { CourseDraft } from '../../core/admin/model';
import type { LoadedCourse, ManifestResult } from '../../core/content/loader';
import { t, tf } from '../../core/i18n';
import { PublishedCourses } from './PublishedCourses';

const manifest: ManifestResult = {
  ok: true,
  manifest: {
    schemaVersion: 1,
    generatedAt: '2026-11-21T00:00:00Z',
    courses: [
      { id: 'crs-aaaaaaaa', title: 'Science', version: 1, files: {} },
      { id: 'crs-bbbbbbbb', title: 'ગણિત', version: 1, files: {} },
    ],
  },
};

const loaded = (id: string, title: string): LoadedCourse => ({
  card: { state: 'ready', value: { id, title, order: 1 } },
  overview: { state: 'empty' },
  content: { state: 'empty' },
  test: { state: 'empty' },
});

function makeDeps(change: Partial<PublishedDeps> = {}): PublishedDeps {
  return {
    loadManifest: () => Promise.resolve(manifest),
    loadCourse: (id) => Promise.resolve(loaded(id, id === 'crs-aaaaaaaa' ? 'Science' : 'ગણિત')),
    fetchBytes: () => Promise.resolve(null),
    contentUrl: (p) => `/content/${p}`,
    ...change,
  };
}

const showList = () => fireEvent.click(screen.getByRole('button', { name: t('admin.published.load') }));

describe('PublishedCourses', () => {
  it('shows only the load button at first and reads nothing yet', () => {
    const loadManifest = vi.fn(() => Promise.resolve(manifest));
    render(<PublishedCourses draftIds={[]} onLoaded={() => undefined} deps={makeDeps({ loadManifest })} />);
    expect(screen.getByRole('heading', { level: 3, name: t('admin.published.title') })).toBeInTheDocument();
    expect(screen.getByText(t('admin.published.hint'))).toBeInTheDocument();
    expect(loadManifest).not.toHaveBeenCalled();
  });

  it('lists the published courses with a Load button each', async () => {
    render(<PublishedCourses draftIds={[]} onLoaded={() => undefined} deps={makeDeps()} />);
    showList();
    expect(await screen.findByText('Science')).toBeInTheDocument();
    expect(screen.getByText('ગણિત')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tf('admin.published.loadNamed', { title: 'Science' }) })).toBeEnabled();
  });

  it('leaves out courses that are already drafts, and says so when nothing is left', async () => {
    const { rerender } = render(
      <PublishedCourses draftIds={['crs-aaaaaaaa']} onLoaded={() => undefined} deps={makeDeps()} />,
    );
    showList();
    expect(await screen.findByText('ગણિત')).toBeInTheDocument();
    expect(screen.queryByText('Science')).toBeNull();
    rerender(<PublishedCourses draftIds={['crs-aaaaaaaa', 'crs-bbbbbbbb']} onLoaded={() => undefined} deps={makeDeps()} />);
    expect(screen.getByText(t('admin.published.empty'))).toBeInTheDocument();
  });

  it('loads the chosen course and hands the draft up', async () => {
    const drafts: CourseDraft[] = [];
    render(<PublishedCourses draftIds={[]} onLoaded={(d) => drafts.push(d)} deps={makeDeps()} />);
    showList();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.published.loadNamed', { title: 'Science' }) }));
    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts.map((d) => d.course)).toEqual([{ id: 'crs-aaaaaaaa', title: 'Science', order: 1 }]);
  });

  it('shows a friendly message when the list cannot be loaded, and the button stays', async () => {
    const loadManifest = () => Promise.resolve({ ok: false, reason: 'unavailable', errors: ['x'] } as ManifestResult);
    render(<PublishedCourses draftIds={[]} onLoaded={() => undefined} deps={makeDeps({ loadManifest })} />);
    showList();
    expect(await screen.findByRole('alert')).toHaveTextContent(t('admin.published.err.list'));
    expect(screen.getByRole('button', { name: t('admin.published.load') })).toBeEnabled();
  });

  it.each<[string, Partial<PublishedDeps>, string]>([
    ['the course is not available', { loadCourse: () => Promise.resolve({ ...loaded('crs-aaaaaaaa', 'S'), card: { state: 'empty' } }) }, 'admin.published.err.unavailable'],
    [
      'the course is broken',
      { loadCourse: () => Promise.resolve({ ...loaded('crs-aaaaaaaa', 'S'), card: { state: 'invalid', errors: ['x'] } }) },
      'admin.published.err.invalid',
    ],
    [
      'a picture cannot be fetched',
      {
        loadCourse: () =>
          Promise.resolve({
            ...loaded('crs-aaaaaaaa', 'S'),
            card: { state: 'ready', value: { id: 'crs-aaaaaaaa', title: 'S', order: 1, cover: 'images/c.png' } },
          }),
      },
      'admin.published.err.image',
    ],
  ])('shows a friendly message when %s, and nothing is opened', async (_name, change, key) => {
    const drafts: CourseDraft[] = [];
    render(<PublishedCourses draftIds={[]} onLoaded={(d) => drafts.push(d)} deps={makeDeps(change)} />);
    showList();
    fireEvent.click(await screen.findByRole('button', { name: tf('admin.published.loadNamed', { title: 'Science' }) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t(key as 'admin.published.err.invalid'));
    expect(drafts).toHaveLength(0);
  });
});
