import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Problem } from '../../core/admin/problems';
import { t, tf } from '../../core/i18n';
import { ProblemSummary } from './ProblemSummary';

const OVERVIEW = t('admin.editor.overview');

describe('ProblemSummary', () => {
  it('shows nothing for an empty list', () => {
    const { container } = render(<ProblemSummary problems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is an alert that lists every problem with its part and number filled in', () => {
    const problems: Problem[] = [
      { key: 'admin.problem.blockText', part: 'overview', n: 3 },
      { key: 'admin.problem.questionCorrect', n: 2 },
      { key: 'admin.problem.perGame' },
    ];
    render(<ProblemSummary problems={problems} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t('admin.problem.title'));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      tf('admin.problem.blockText', { where: OVERVIEW, n: 3 }),
      tf('admin.problem.questionCorrect', { where: '', n: 2 }),
      t('admin.problem.perGame'),
    ]);
    expect(alert).toHaveFocus();
  });

  it('takes the focus again for a new list', () => {
    const first: Problem[] = [{ key: 'admin.problem.image' }];
    const { rerender } = render(
      <>
        <ProblemSummary problems={first} />
        <button>other</button>
      </>,
    );
    screen.getByRole('button', { name: 'other' }).focus();
    rerender(
      <>
        <ProblemSummary problems={[{ key: 'admin.problem.image' }]} />
        <button>other</button>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
