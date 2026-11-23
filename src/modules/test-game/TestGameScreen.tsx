import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { findCourseTests } from '../../core/content/courseTests';
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
import { TestListView } from './TestListView';
import { createSound, type Sound } from './sound';
import './TestGameScreen.css';

// The test game screen (P07, SPEC C5): loads the course's test, then runs intro -> questions -> result.
// All rules live in engine.ts; sound.ts and confetti.ts only decorate. The attempt is saved ONCE, when the result opens.
// An unknown course, an empty or broken test, or a test that would ask 0 questions = the owner's "not available" text + Back.
// Several tests (P10 T11t d): the path without a test id shows a short list, `.../test/<test id>` plays that test; ONE test is played at once.

export interface TestGameScreenProps {
  /** Random numbers for picking and shuffling. Tests pass a seeded one; the app uses Math.random. */
  rng?: Rng;
  /** Tests pass a fake; the app uses the real Web Audio sound. */
  sound?: Sound;
  /** Tests pass a fake; the app uses the real confetti. */
  confetti?: typeof burst;
}

/** What the address can show: nothing, ONE test to play, or a short list to choose from (several tests and no test id). */
type Found = { kind: 'none' } | { kind: 'play'; test: Test } | { kind: 'list'; tests: Test[] };

const NOTHING: Found = { kind: 'none' };

const hasQuestions = (test: Test): boolean => effectiveQuestionCount(test.questionsPerGame, test.questions.length) >= 1;

/** The playable tests of `tests/<id>.json` (and the old `test.json`). Never throws: a problem gives an empty list. */
async function severalTests(courseId: string): Promise<Test[]> {
  try {
    return (await findCourseTests(courseId)).filter(hasQuestions);
  } catch {
    return [];
  }
}

/**
 * `none` = nothing to play (unknown course, empty or broken test, zero questions, unknown test id, load error). Never throws.
 * Without a test id: no test = none, ONE test = play it, several = the list. With a test id: that test, or none.
 */
async function readTests(courseId: string, testId: string | undefined): Promise<Found> {
  try {
    const loaded = await loadCourse(courseId);
    if (loaded.card.state !== 'ready') return NOTHING;
    const found = await severalTests(courseId);
    const legacy = loaded.test.state === 'ready' && hasQuestions(loaded.test.value) ? [loaded.test.value] : [];
    const tests = found.length > 0 ? found : legacy;
    if (testId !== undefined) {
      const chosen = tests.find((test) => test.id === testId);
      return chosen === undefined ? NOTHING : { kind: 'play', test: chosen };
    }
    if (tests.length === 0) return NOTHING;
    if (tests.length === 1) return { kind: 'play', test: tests[0] };
    return { kind: 'list', tests };
  } catch {
    return NOTHING;
  }
}

/** The route element. The inner screen is keyed by course and test, so another one always starts from a clean state. */
export function TestGameScreen(props: TestGameScreenProps) {
  const params = useParams();
  const courseId = params.courseId ?? '';
  const testId = params.testId;
  return <TestGame key={`${courseId}/${testId ?? ''}`} courseId={courseId} testId={testId} {...props} />;
}

function TestGame({
  courseId,
  testId,
  rng,
  sound: givenSound,
  confetti = burst,
}: TestGameScreenProps & { courseId: string; testId: string | undefined }) {
  const navigate = useNavigate();
  const random: Rng = rng ?? Math.random;
  const [sound] = useState<Sound>(() => givenSound ?? createSound());
  const [muted, setMuted] = useState<boolean>(() => sound.muted);
  const [loaded, setLoaded] = useState<Found | null>(null);
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
    void readTests(courseId, testId).then((found) => {
      if (!cancelled) setLoaded(found);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, testId]);

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

  if (loaded.kind === 'list') {
    return (
      <section className="np-test" ref={rootRef}>
        {header(false)}
        <TestListView tests={loaded.tests} onOpen={(id) => navigate(`/course/${courseId}/test/${id}`)} />
        {backToCourse()}
      </section>
    );
  }

  if (loaded.kind === 'none') {
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

  const test = loaded.test;

  const begin = (): void => {
    const state = startGame(test, random);
    if (state === null) {
      setLoaded(NOTHING);
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
