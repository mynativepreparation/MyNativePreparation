import { ArrowLeft, ClipboardList, RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button, Card, StarRating } from '../../core/ui';
import type { GameResult } from './engine';
import './ResultView.css';

export interface ResultViewProps {
  /** The final numbers from `engine.result()`. Stars and percent are shown exactly as given, never recomputed here. */
  result: GameResult;
  onPlayAgain: () => void;
  onBackToCourse: () => void;
  onReport: () => void;
}

// Cheer message by stars (P07 design): 5 Congratulations, 1 Work harder.
const CHEER: Record<GameResult['stars'], TextKey> = {
  5: 'testGame.cheer.5',
  4: 'testGame.cheer.4',
  3: 'testGame.cheer.3',
  2: 'testGame.cheer.2',
  1: 'testGame.cheer.1',
};

// Last screen of a game: stars (pop in one by one), percent, "7 of 10 correct", a cheer message and three buttons.
export function ResultView({ result, onPlayAgain, onBackToCourse, onReport }: ResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const percent = Math.round(result.percent);

  // Screen readers and keyboard users start at the heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="np-result" aria-labelledby={headingId}>
      <Card className="np-result__card">
        <h2 className="np-result__title" id={headingId} ref={headingRef} tabIndex={-1}>
          {t('testGame.result.title')}
        </h2>
        <StarRating
          className="np-result__stars"
          value={result.stars}
          label={tf('testGame.result.stars', { stars: result.stars })}
          animate
          tone="star"
        />
        <p className="np-result__cheer" role="status" aria-live="polite">
          {t(CHEER[result.stars])}
        </p>
        <p className="np-result__percent">{tf('testGame.result.percent', { percent })}</p>
        <p className="np-result__summary">
          {tf('testGame.result.summary', { correct: result.correct, asked: result.asked })}
        </p>
      </Card>

      <div className="np-result__actions">
        <Button size="lg" icon={<RotateCcw size={20} aria-hidden="true" />} onClick={onPlayAgain}>
          {t('testGame.playAgain')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={<ArrowLeft size={20} aria-hidden="true" />}
          onClick={onBackToCourse}
        >
          {t('course.backToCourse')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={<ClipboardList size={20} aria-hidden="true" />}
          onClick={onReport}
        >
          {t('testGame.report')}
        </Button>
      </div>
    </section>
  );
}
