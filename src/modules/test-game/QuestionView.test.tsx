import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question, Test } from '../../core/content/types';
import { answer, currentQuestion, next, startGame, type GameState } from './engine';
import { QuestionView } from './QuestionView';

afterEach(() => cleanup());

function question(i: number, explanation?: string): Question {
  const q: Question = {
    id: `qst-${String(i).padStart(8, '0')}`,
    text: `Question number ${i}?`,
    options: [`Q${i} first`, `Q${i} second`, `Q${i} third`, `Q${i} fourth`],
    correctIndex: (i % 4) as 0 | 1 | 2 | 3,
  };
  if (explanation !== undefined) q.explanation = explanation;
  return q;
}

function makeState(count = 3, explanation?: string): GameState {
  const test: Test = {
    id: 'tst-00000001',
    questionsPerGame: count,
    questions: Array.from({ length: count }, (_, i) => question(i + 1, explanation)),
  };
  const state = startGame(test, () => 0.5);
  if (!state) throw new Error('no game');
  return state;
}

function setup(state: GameState) {
  const onAnswer = vi.fn();
  const onNext = vi.fn();
  const view = render(<QuestionView state={state} onAnswer={onAnswer} onNext={onNext} />);
  return { onAnswer, onNext, ...view };
}

const optionButtons = () => within(screen.getByRole('group')).getAllByRole('button');
const rightIndex = (state: GameState) => currentQuestion(state).correctIndex;
const wrongIndex = (state: GameState) => (rightIndex(state) + 1) % 4;

describe('asking', () => {
  it('shows the question as a heading, the progress, the score and four lettered options', () => {
    const state = makeState(3);
    setup(state);
    const q = currentQuestion(state);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(q.text);
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
    const buttons = optionButtons();
    expect(buttons).toHaveLength(4);
    buttons.forEach((button, i) => {
      expect(button).toHaveTextContent(String.fromCharCode(65 + i));
      expect(button).toHaveTextContent(q.options[i]);
      expect(button).toBeEnabled();
    });
  });

  it('has a progress bar that counts answered questions', () => {
    const state = makeState(4);
    const first = setup(state);
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toHaveAttribute('aria-valuenow', '0');
    first.unmount();
    setup(answer(state, 0));
    const bar = screen.getByRole('progressbar', { name: 'Quiz progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
  });

  it('has an empty live region before the answer and no Next button yet', () => {
    setup(makeState());
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /next|see result/i })).not.toBeInTheDocument();
  });

  it('reports the position of the tapped option', () => {
    const { onAnswer } = setup(makeState());
    fireEvent.click(optionButtons()[2]);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(2);
  });

  it('moves focus to the question when it appears', () => {
    setup(makeState());
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });
});

describe('answered correctly', () => {
  it('says Correct!, marks the right option with a word and an icon, locks every option, shows Next', () => {
    const asking = makeState(3);
    const right = rightIndex(asking);
    setup(answer(asking, right));

    expect(within(screen.getByRole('status')).getByText('Correct!')).toBeInTheDocument();
    const buttons = optionButtons();
    buttons.forEach((button) => expect(button).toBeDisabled());
    expect(buttons[right]).toHaveTextContent('Correct answer');
    expect(buttons[right].querySelector('svg')).not.toBeNull();
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument();
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});

describe('answered wrongly', () => {
  it('says Not quite., marks the chosen option "Your answer" and still shows the right one', () => {
    const asking = makeState(3);
    const right = rightIndex(asking);
    const wrong = wrongIndex(asking);
    setup(answer(asking, wrong));

    expect(within(screen.getByRole('status')).getByText('Not quite.')).toBeInTheDocument();
    const buttons = optionButtons();
    expect(buttons[wrong]).toHaveTextContent('Your answer');
    expect(buttons[wrong].querySelector('svg')).not.toBeNull();
    expect(buttons[right]).toHaveTextContent('Correct answer');
    buttons.forEach((button, i) => {
      if (i !== wrong && i !== right) {
        expect(button).not.toHaveTextContent('Your answer');
        expect(button).not.toHaveTextContent('Correct answer');
        expect(button.querySelector('svg')).toBeNull();
      }
    });
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
  });
});

describe('explanation', () => {
  it('appears after answering when the developer wrote one', () => {
    const asking = makeState(2, 'Because it is so.');
    setup(answer(asking, wrongIndex(asking)));
    const region = screen.getByRole('status');
    expect(within(region).getByText('Explanation')).toBeInTheDocument();
    expect(within(region).getByText('Because it is so.')).toBeInTheDocument();
  });

  it('is not shown before answering', () => {
    setup(makeState(2, 'Because it is so.'));
    expect(screen.queryByText('Because it is so.')).not.toBeInTheDocument();
  });

  it('is left out when there is none', () => {
    const asking = makeState(2);
    setup(answer(asking, rightIndex(asking)));
    expect(screen.queryByText('Explanation')).not.toBeInTheDocument();
  });
});

describe('Next / See result', () => {
  it('says Next on a middle question and reports the tap', () => {
    const asking = makeState(3);
    const { onNext } = setup(answer(asking, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('says See result on the last question', () => {
    let state = makeState(2);
    state = next(answer(state, 0)); // now on question 2 of 2
    state = answer(state, 0);
    setup(state);
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See result' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('hands the keyboard focus to the button after an answer', () => {
    setup(answer(makeState(3), 0));
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('draws the next question when the state moves on', () => {
    const first = makeState(3);
    const view = setup(first);
    const second = next(answer(first, 0));
    view.rerender(<QuestionView state={second} onAnswer={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(currentQuestion(second).text);
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    optionButtons().forEach((button) => expect(button).toBeEnabled());
  });

  it('draws nothing once the game is finished', () => {
    const finished = next(answer(makeState(1), 0));
    expect(finished.status).toBe('finished');
    const { container } = setup(finished);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('keyboard', () => {
  it.each([
    ['1', 0],
    ['2', 1],
    ['3', 2],
    ['4', 3],
    ['a', 0],
    ['B', 1],
    ['c', 2],
    ['D', 3],
  ])('key %s chooses option %i', (key, index) => {
    const { onAnswer } = setup(makeState());
    fireEvent.keyDown(document.body, { key });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(index);
  });

  it.each(['0', '5', 'e', 'Enter', ' ', 'Backspace', 'ArrowDown'])('key %s does not answer', (key) => {
    const { onAnswer, onNext } = setup(makeState());
    fireEvent.keyDown(document.body, { key });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores keys with Ctrl, Alt or Meta, and held-down repeats', () => {
    const { onAnswer } = setup(makeState());
    fireEvent.keyDown(document.body, { key: '1', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'a', altKey: true });
    fireEvent.keyDown(document.body, { key: 'b', metaKey: true });
    fireEvent.keyDown(document.body, { key: '2', repeat: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('does not answer again after the question was answered, but Enter goes on', () => {
    const { onAnswer, onNext } = setup(answer(makeState(3), 0));
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter on a focused button to the button itself (no double Next)', () => {
    const { onNext } = setup(answer(makeState(3), 0));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'Enter' });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('stops listening when the view goes away', () => {
    const { onAnswer, unmount } = setup(makeState());
    unmount();
    fireEvent.keyDown(document.body, { key: '1' });
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('long text', () => {
  it('shows a very long question and long options without breaking the markup', () => {
    const long = 'word '.repeat(80).trim();
    const test: Test = {
      id: 'tst-00000002',
      questionsPerGame: 1,
      questions: [
        { id: 'qst-00000001', text: long, options: [long, `${long} 2`, `${long} 3`, `${long} 4`], correctIndex: 1 },
      ],
    };
    const state = startGame(test, () => 0.5);
    if (!state) throw new Error('no game');
    setup(state);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(long);
    expect(optionButtons()).toHaveLength(4);
  });
});
