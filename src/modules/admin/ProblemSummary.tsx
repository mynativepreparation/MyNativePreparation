import { useEffect, useRef } from 'react';
import type { Problem } from '../../core/admin/problems';
import { t, tf } from '../../core/i18n';
import './ProblemSummary.css';

// "Please fix this before saving" list (P10 T9(a)). It is an alert and takes the keyboard focus when it appears, so a screen
// reader reads it and a keyboard user can start fixing. Problems come from `summarizeProblems` (friendly text, never raw errors).

export function ProblemSummary({ problems }: { problems: Problem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  // A new list (every failed Save) moves the focus here again.
  useEffect(() => {
    if (problems.length > 0) ref.current?.focus();
  }, [problems]);

  if (problems.length === 0) return null;
  return (
    <div ref={ref} className="np-problems" role="alert" tabIndex={-1}>
      <p className="np-problems__title">
        <span aria-hidden="true">! </span>
        {t('admin.problem.title')}
      </p>
      <ul className="np-problems__list">
        {problems.map((problem, index) => {
          const where =
            problem.part === undefined ? '' : t(problem.part === 'overview' ? 'admin.editor.overview' : 'admin.editor.content');
          return <li key={index}>{tf(problem.key, { where, n: problem.n ?? 0 })}</li>;
        })}
      </ul>
    </div>
  );
}
