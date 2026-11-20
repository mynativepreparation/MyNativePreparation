import { ArrowRight, Check, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { t, tf } from '../../core/i18n';
import { Button, Card, ProgressBar, cx } from '../../core/ui';
import { currentQuestion, scoreSoFar, type GameState } from './engine';
import './QuestionView.css';

export interface QuestionViewProps {
  /** A game that is `asking` or `answered`. The view draws it and reports taps; it never changes the state itself. */
  state: GameState;
  /** The person chose option `index` (0-3, in the order shown). */
  onAnswer: (index: number) => void;
  /** The person wants the next question, or the result after the last one. */
  onNext: () => void;
}

/** Keys 1-4 and A-D choose an option. Returns the option index, or null for any other key. */
function keyToIndex(key: string): number | null {
  if (key >= '1' && key <= '4') return Number(key) - 1;
  const lower = key.toLowerCase();
  if (lower >= 'a' && lower <= 'd' && lower.length === 1) return lower.charCodeAt(0) - 'a'.charCodeAt(0);
  return null;
}

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

// One question: progress, running score, the question, four lettered options, feedback after the answer, Next / See result.
// Right and wrong are never shown by colour alone: every mark has an icon AND a word.
export function QuestionView({ state, onAnswer, onNext }: QuestionViewProps) {
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const finished = state.status === 'finished';
  const answered = state.status === 'answered';
  const question = currentQuestion(state);
  const total = state.questions.length;
  const optionCount = question.options.length;

  // A new question: move focus to it, so a screen reader starts reading it and keyboard users start at the top.
  useEffect(() => {
    if (state.status === 'asking') headingRef.current?.focus({ preventScroll: true });
  }, [state.current, state.status]);

  // The option buttons are disabled after the answer, so hand the focus to Next (keyboard users keep their place).
  useEffect(() => {
    if (answered) rootRef.current?.querySelector<HTMLButtonElement>('[data-np-next]')?.focus();
  }, [answered, state.current]);

  // Keyboard: 1-4 or A-D answer, Enter goes on (only when focus is not on a button, which handles Enter itself).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (state.status === 'asking') {
        const index = keyToIndex(event.key);
        if (index !== null && index < optionCount) {
          event.preventDefault();
          onAnswer(index);
        }
      } else if (state.status === 'answered' && event.key === 'Enter') {
        if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.status, optionCount, onAnswer, onNext]);

  if (finished) return null;

  const chosenIndex = answered ? state.answers[state.current].chosenIndex : null;
  const isCorrect = answered && state.answers[state.current].correct;
  const isLast = state.current >= total - 1;

  return (
    <section className="np-question" ref={rootRef} aria-labelledby={headingId} key={question.id}>
      <div className="np-question__top">
        <p className="np-question__count">{tf('testGame.progress', { current: state.current + 1, total })}</p>
        <p className="np-question__score">{tf('testGame.score', { score: scoreSoFar(state) })}</p>
      </div>
      <ProgressBar value={state.answers.length} max={total} label={t('testGame.progressLabel')} showPercent={false} />

      <h2 className="np-question__text" id={headingId} ref={headingRef} tabIndex={-1}>
        {question.text}
      </h2>

      <div className="np-question__options" role="group" aria-labelledby={headingId}>
        {question.options.map((option, index) => {
          const letter = String.fromCharCode(65 + index);
          const isRight = answered && index === question.correctIndex;
          const isWrongChoice = answered && index === chosenIndex && index !== question.correctIndex;
          return (
            <button
              key={letter}
              type="button"
              className={cx(
                'np-option',
                isRight ? 'np-option--correct' : undefined,
                isWrongChoice ? 'np-option--wrong' : undefined,
                answered && !isRight && !isWrongChoice ? 'np-option--rest' : undefined,
              )}
              disabled={answered}
              onClick={() => onAnswer(index)}
            >
              <span className="np-option__letter">{letter}</span>
              <span className="np-option__body">
                <span className="np-option__text">{option}</span>
                {isRight && <span className="np-option__tag">{t('testGame.tagCorrect')}</span>}
                {isWrongChoice && <span className="np-option__tag">{t('testGame.tagYours')}</span>}
              </span>
              {isRight && <Check className="np-option__icon" size={24} aria-hidden="true" />}
              {isWrongChoice && <X className="np-option__icon" size={24} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="np-question__feedback" role="status" aria-live="polite">
        {answered && (
          <>
            <p className={cx('np-feedback', isCorrect ? 'np-feedback--correct' : 'np-feedback--wrong')}>
              {isCorrect ? <Check size={24} aria-hidden="true" /> : <X size={24} aria-hidden="true" />}
              <span>{isCorrect ? t('testGame.correct') : t('testGame.wrong')}</span>
            </p>
            {question.explanation !== undefined && question.explanation !== '' && (
              <Card className="np-question__explanation">
                <p className="np-question__explanation-title">{t('testGame.explanation')}</p>
                <p className="np-question__explanation-text">{question.explanation}</p>
              </Card>
            )}
          </>
        )}
      </div>

      {answered && (
        <Button
          size="lg"
          className="np-question__next"
          data-np-next=""
          icon={<ArrowRight size={20} aria-hidden="true" />}
          onClick={onNext}
        >
          {isLast ? t('testGame.seeResult') : t('testGame.next')}
        </Button>
      )}

      <p className="np-question__hint">{t('testGame.keysHint')}</p>
    </section>
  );
}
