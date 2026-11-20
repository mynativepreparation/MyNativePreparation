import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { contentUrl, loadCourse } from '../../core/content/loader';
import { effectiveQuestionCount } from '../../core/content/scoring';
import type { Test } from '../../core/content/types';
import { t } from '../../core/i18n';
import { addAttempt } from '../../core/storage/repo';
import { Button, Card, IconButton, NotAvailable } from '../../core/ui';
import { burst } from './confetti';
import { answer, next, result, startGame, type GameState, type Rng } from './engine';
import { IntroView } from './IntroView';
import { QuestionView } from './QuestionView';
import { ResultView } from './ResultView';
import { createSound, type Sound } from './sound';
import './TestGameScreen.css';

// The test game screen (P07, SPEC C5): loads the course's test, then runs intro -> questions -> result.
// All rules live in engine.ts; sound.ts and confetti.ts only decorate. The attempt is saved ONCE, when the result opens.
// An unknown course, an empty or broken test, or a test that would ask 0 questions = the owner's "not available" text + Back.

export interface TestGameScreenProps {
  /** Random numbers for picking and shuffling. Tests pass a seeded one; the app uses Math.random. */
  rng?: Rng;
  /** Tests pass a fake; the app uses the real Web Audio sound. */
  sound?: Sound;
  /** Tests pass a fake; the app uses the real confetti. */
  confetti?: typeof burst;
}

/** `null` = nothing to play (unknown course, empty or broken test, zero questions, load error). Never throws. */
async function readTest(courseId: string): Promise<Test | null> {
  try {
    const loaded = await loadCourse(courseId);
    if (loaded.card.state !== 'ready') return null;
    if (loaded.test.state !== 'ready') return null;
    const test = loaded.test.value;
    if (effectiveQuestionCount(test.questionsPerGame, test.questions.length) < 1) return null;
    return test;
  } catch {
    return null;
  }
}

/** The route element. The inner screen is keyed by course, so another course always starts from a clean state. */
export function TestGameScreen(props: TestGameScreenProps) {
  const courseId = useParams().courseId ?? '';
  return <TestGame key={courseId} courseId={courseId} {...props} />;
}

function TestGame({ courseId, rng, sound: givenSound, confetti = burst }: TestGameScreenProps & { courseId: string }) {
  const navigate = useNavigate();
  const random: Rng = rng ?? Math.random;
  const [sound] = useState<Sound>(() => givenSound ?? createSound());
  const [muted, setMuted] = useState<boolean>(() => sound.muted);
  const [loaded, setLoaded] = useState<{ test: Test | null } | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const gameRef = useRef<GameState | null>(null); // the newest state, so two quick taps can never both count
  const savedFor = useRef<GameState | null>(null); // the finished game that was already saved
  const rootRef = useRef<HTMLElement>(null);
  const leaveTitleId = useId();
  const leaveTextId = useId();

  const update = useCallback((state: GameState | null) => {
    gameRef.current = state;
    setGame(state);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readTest(courseId).then((test) => {
      if (!cancelled) setLoaded({ test });
    });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // The sound context is released when the screen closes.
  useEffect(() => () => sound.dispose(), [sound]);

  const finished = game !== null && game.status === 'finished';
  const playing = game !== null && !finished;

  // Leaving halfway (button, browser back, bottom navigation) asks first. Nothing is saved for a quit game.
  const blocker = useBlocker(playing);
  const askingToLeave = blocker.state === 'blocked';

  // The result opens: save the attempt once, then the fanfare. (A re-render or a repeated effect run never saves twice.)
  useEffect(() => {
    if (game === null || game.status !== 'finished') return;
    if (savedFor.current === game) return;
    savedFor.current = game;
    const done = result(game);
    if (done === null) return;
    sound.play('result', done.stars);
    addAttempt({ courseId, testId: game.testId, asked: done.asked, correct: done.correct }).catch(() => setSaveFailed(true));
  }, [game, courseId, sound]);

  // Confetti only for 3+ stars (confetti.ts itself does nothing under "reduce motion"). Stopped when the screen changes or closes.
  useEffect(() => {
    if (game === null || game.status !== 'finished') return undefined;
    const done = result(game);
    if (done === null || done.stars < 3) return undefined;
    return confetti(rootRef.current ?? document.body);
  }, [game, confetti]);

  const header = (withSound: boolean) => (
    <header className="np-test__header">
      <h1 className="np-test__title">{t('course.tile.test')}</h1>
      {withSound && (
        <IconButton
          label={muted ? t('testGame.unmute') : t('testGame.mute')}
          icon={muted ? <VolumeX size={24} aria-hidden="true" /> : <Volume2 size={24} aria-hidden="true" />}
          onClick={() => {
            sound.setMuted(!muted);
            setMuted(!muted);
          }}
        />
      )}
    </header>
  );

  const backToCourse = () => (
    <div className="np-test__actions">
      <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate(`/course/${courseId}`)}>
        {t('course.backToCourse')}
      </Button>
    </div>
  );

  if (loaded === null) {
    return (
      <section className="np-test" ref={rootRef}>
        <p role="status" className="np-test__sr">
          {t('course.loading')}
        </p>
        <Card className="np-test__skeleton" aria-hidden="true" />
      </section>
    );
  }

  const test = loaded.test;
  if (test === null) {
    return (
      <section className="np-test" ref={rootRef}>
        {header(false)}
        <Card className="np-test__message">
          <NotAvailable />
        </Card>
        {backToCourse()}
      </section>
    );
  }

  const begin = (): void => {
    const state = startGame(test, random);
    if (state === null) {
      setLoaded({ test: null });
      return;
    }
    setSaveFailed(false);
    update(state);
  };

  if (askingToLeave) {
    return (
      <section className="np-test" ref={rootRef}>
        {header(false)}
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={leaveTitleId}
          aria-describedby={leaveTextId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') blocker.reset();
          }}
        >
          <Card className="np-test__leave">
            <h2 className="np-test__leave-title" id={leaveTitleId}>
              {t('testGame.leaveTitle')}
            </h2>
            <p className="np-test__leave-text" id={leaveTextId}>
              {t('testGame.leaveText')}
            </p>
            <div className="np-test__leave-actions">
              <Button size="lg" autoFocus onClick={() => blocker.reset()}>
                {t('testGame.stay')}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => blocker.proceed()}>
                {t('testGame.leaveConfirm')}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  if (game === null) {
    return (
      <section className="np-test" ref={rootRef}>
        {header(true)}
        <IntroView
          title={test.title}
          imageSrc={test.image ? contentUrl(`courses/${courseId}/${test.image}`) : undefined}
          questionCount={effectiveQuestionCount(test.questionsPerGame, test.questions.length)}
          onStart={() => {
            sound.unlock(); // the Start tap is the user gesture the browser needs before it allows sound
            sound.play('tap');
            begin();
          }}
        />
        {backToCourse()}
      </section>
    );
  }

  const done = result(game);
  if (done !== null) {
    return (
      <section className="np-test" ref={rootRef}>
        {header(true)}
        <ResultView
          result={done}
          onPlayAgain={() => {
            sound.play('tap');
            begin();
          }}
          onBackToCourse={() => navigate(`/course/${courseId}`)}
          onReport={() => navigate(`/course/${courseId}/report`)}
        />
        {saveFailed && (
          <p role="status" className="np-test__note">
            {t('testGame.saveFailed')}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="np-test" ref={rootRef}>
      {header(true)}
      <QuestionView
        state={game}
        onAnswer={(index) => {
          const current = gameRef.current;
          if (current === null) return;
          const after = answer(current, index);
          if (after === current) return;
          sound.play(after.answers[after.answers.length - 1].correct ? 'correct' : 'wrong');
          update(after);
        }}
        onNext={() => {
          const current = gameRef.current;
          if (current === null) return;
          const after = next(current);
          if (after !== current) update(after);
        }}
      />
      <div className="np-test__actions">
        <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => navigate(`/course/${courseId}`)}>
          {t('testGame.leave')}
        </Button>
      </div>
    </section>
  );
}
