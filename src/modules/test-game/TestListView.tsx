import { ClipboardList } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { effectiveQuestionCount } from '../../core/content/scoring';
import type { Test } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { Tile } from '../../core/ui';
import './TestListView.css';

export interface TestListViewProps {
  /** The playable tests of the course, in the order they are shown (the old `test.json` first). */
  tests: readonly Test[];
  /** The tap on one test: the screen opens it at its own address. */
  onOpen: (testId: string) => void;
}

// A course with SEVERAL tests (P10 T11t d, DECISIONS Q27): a short list, one big tile per test (its title, or "Test N" when it has
// none, and how many questions one game asks). A course with ONE test never shows this list.
export function TestListView({ tests, onOpen }: TestListViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  // Screen readers and keyboard users start at the heading, like on the intro.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="np-testlist" aria-labelledby={headingId}>
      <h2 className="np-testlist__title" id={headingId} ref={headingRef} tabIndex={-1}>
        {t('testGame.list.title')}
      </h2>
      <ul className="np-testlist__grid" data-np-check>
        {tests.map((test, index) => (
          <li key={test.id}>
            <Tile
              icon={<ClipboardList size={28} aria-hidden="true" />}
              title={test.title !== undefined && test.title.trim() !== '' ? test.title : tf('testGame.list.name', { number: index + 1 })}
              subtitle={tf('testGame.list.questions', { count: effectiveQuestionCount(test.questionsPerGame, test.questions.length) })}
              onClick={() => onOpen(test.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
