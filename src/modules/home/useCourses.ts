import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCourse, loadManifest } from '../../core/content/loader';
import type { CourseCard } from '../../core/content/types';

// Home data (P05 T1): the manifest lists the courses, course.json of each one gives the card. Nothing here throws.
// A course whose card is missing or broken stays in the list as an entry with `card: null` (Home shows it disabled with the "not available" text).

export interface CourseEntry {
  id: string;
  /** Title from course.json, or from the manifest when the card is not usable. */
  title: string;
  /** null when course.json is missing or broken. */
  card: CourseCard | null;
}

export type CoursesState =
  | { status: 'loading' }
  | { status: 'ready'; courses: CourseEntry[] }
  /** The manifest is fine but lists no course. */
  | { status: 'empty' }
  /** The manifest is missing (offline first run) or broken. */
  | { status: 'error'; reason: 'unavailable' | 'invalid' };

/** Cards sorted by `order` (lower first); entries without a card come last in manifest order (Array.sort is stable). */
function compareEntries(a: CourseEntry, b: CourseEntry): number {
  if (a.card && b.card) return a.card.order - b.card.order;
  if (a.card) return -1;
  if (b.card) return 1;
  return 0;
}

async function readCard(id: string): Promise<CourseCard | null> {
  try {
    const loaded = await loadCourse(id);
    return loaded.card.state === 'ready' ? loaded.card.value : null;
  } catch {
    return null;
  }
}

async function readCourses(): Promise<CoursesState> {
  try {
    const manifest = await loadManifest();
    if (!manifest.ok) return { status: 'error', reason: manifest.reason };
    if (manifest.manifest.courses.length === 0) return { status: 'empty' };
    const entries = await Promise.all(
      manifest.manifest.courses.map(async (course): Promise<CourseEntry> => {
        const card = await readCard(course.id);
        return { id: course.id, title: card?.title ?? course.title, card };
      }),
    );
    return { status: 'ready', courses: entries.sort(compareEntries) };
  } catch {
    return { status: 'error', reason: 'unavailable' };
  }
}

export function useCourses(): { state: CoursesState; retry: () => void; refresh: () => Promise<boolean> } {
  const [state, setState] = useState<CoursesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readCourses().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  /**
   * Loads the list again WITHOUT the loading skeleton (P11 T8c: the content changed on the server). A list that arrives replaces the
   * old one and the answer is `true`; a failure (offline, broken manifest) keeps the list that is shown and the answer is `false`.
   */
  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await readCourses();
    if (!alive.current || result.status === 'error') return false;
    setState(result);
    return true;
  }, []);

  return { state, retry, refresh };
}
