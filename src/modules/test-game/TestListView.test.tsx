import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { TestListView } from './TestListView';

function make(id: string, count: number, title?: string, perGame = count): Test {
  const base: Test = {
    id,
    questionsPerGame: perGame,
    questions: Array.from({ length: count }, (_unused, i) => ({
      id: `qst-aaaa000${i}`,
      text: `Question ${i}?`,
      options: ['a', 'b', 'c', 'd'] as [string, string, string, string],
      correctIndex: 0 as const,
    })),
  };
  return title === undefined ? base : { ...base, title };
}

afterEach(() => cleanup());

describe('TestListView', () => {
  it('shows a heading and one button per test', () => {
    render(<TestListView tests={[make('tst-aaaa0001', 2, 'Science quiz'), make('tst-bbbb0002', 1)]} onOpen={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: t('testGame.list.title') })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the title of a test, or "Test N" (N = its place in the list) when it has none', () => {
    render(
      <TestListView
        tests={[make('tst-aaaa0001', 2, 'Science quiz'), make('tst-bbbb0002', 1), make('tst-cccc0003', 1, '   ')]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Science quiz')).toBeInTheDocument();
    expect(screen.getByText('Test 2')).toBeInTheDocument();
    expect(screen.getByText('Test 3')).toBeInTheDocument();
  });

  it('shows how many questions one game asks (never more than the test has)', () => {
    render(<TestListView tests={[make('tst-aaaa0001', 3, 'Big', 20), make('tst-bbbb0002', 5, 'Small', 2)]} onOpen={vi.fn()} />);

    expect(screen.getByText('Questions: 3')).toBeInTheDocument();
    expect(screen.getByText('Questions: 2')).toBeInTheDocument();
  });

  it('a tap on a test reports the id of that test', () => {
    const onOpen = vi.fn();
    render(<TestListView tests={[make('tst-aaaa0001', 2, 'Science quiz'), make('tst-bbbb0002', 1, 'History quiz')]} onOpen={onOpen} />);

    fireEvent.click(screen.getByText('History quiz').closest('button') as HTMLButtonElement);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('tst-bbbb0002');
  });

  it('puts the focus on the heading', () => {
    render(<TestListView tests={[make('tst-aaaa0001', 2, 'A'), make('tst-bbbb0002', 1, 'B')]} onOpen={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
  });
});
