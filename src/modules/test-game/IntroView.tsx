import { Play } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { t, tf } from '../../core/i18n';
import { Button, Card } from '../../core/ui';
import './IntroView.css';

export interface IntroViewProps {
  /** The test title the developer wrote; a friendly default is shown when there is none. */
  title?: string | undefined;
  /** Ready-to-use image address (the screen resolves it). Decorative, so it has no spoken text. */
  imageSrc?: string | undefined;
  /** How many questions THIS game will ask (already limited by `questionsPerGame`). */
  questionCount: number;
  /** The Start tap. The screen uses this user gesture to unlock sound, then starts the game. */
  onStart: () => void;
}

// First screen of a game: what the test is, how many questions, one big Start button.
export function IntroView({ title, imageSrc, questionCount, onStart }: IntroViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const heading = title !== undefined && title.trim() !== '' ? title : t('testGame.intro.defaultTitle');

  // Screen readers and keyboard users start at the heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="np-intro" aria-labelledby={headingId}>
      <Card className="np-intro__card">
        {imageSrc !== undefined && imageSrc !== '' && (
          <img className="np-intro__image" src={imageSrc} alt="" loading="lazy" decoding="async" />
        )}
        <h2 className="np-intro__title" id={headingId} ref={headingRef} tabIndex={-1}>
          {heading}
        </h2>
        <p className="np-intro__count">
          {questionCount === 1 ? t('testGame.intro.countOne') : tf('testGame.intro.count', { count: questionCount })}
        </p>
        <p className="np-intro__rules">{t('testGame.intro.rules')}</p>
        <Button size="lg" className="np-intro__start" icon={<Play size={20} aria-hidden="true" />} onClick={onStart}>
          {t('testGame.start')}
        </Button>
      </Card>
    </section>
  );
}
