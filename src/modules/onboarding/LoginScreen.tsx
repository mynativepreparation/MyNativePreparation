import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t, tf } from '../../core/i18n';
import { checkMnemonic, type MnemonicProblem } from '../../core/identity/mnemonic';
import { unlock } from '../../core/identity/session';
import { AUTH_ROUTES, markOnboarded } from '../../core/identity/status';
import { Button } from '../../core/ui';
import './LoginScreen.css';

interface Problem {
  problem: MnemonicProblem;
  count?: number;
  wordNumber?: number;
}

/** Plain-English text for a reason code. It only ever uses the code, a count or a position: never the typed words. */
function describeProblem({ problem, count, wordNumber }: Problem): string {
  if (problem === 'wrong_count') {
    if (count === 0) return t('login.empty');
    if (count === 1) return t('login.wrongCountOne');
    return tf('login.wrongCount', { count: count ?? 0 });
  }
  if (problem === 'unknown_word') return tf('login.unknownWord', { n: wordNumber ?? 0 });
  return t('login.badChecksum');
}

type Failure = 'empty' | 'wrong_key' | 'failed';

// Login (P04 T11): one multi-line field for the 12 words (paste friendly). The words stay in this component's state only:
// never stored, logged, sent through the wire or put into a message. After a successful login the person counts as onboarded
// (a returning user skips Basic info and Privacy) and goes Home.
export function LoginScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  // Live, reason-based help while typing. Nothing is shown for an empty field.
  const check = text.trim() === '' ? null : checkMnemonic(text);
  const liveHint = check && !check.ok ? describeProblem({ problem: check.reason, count: check.count, wordNumber: check.wordNumber }) : null;

  const failureText =
    failure === 'empty'
      ? t('login.empty')
      : failure === 'wrong_key'
        ? t('login.wrongKey')
        : failure === 'failed'
          ? t('login.failed')
          : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (text.trim() === '') {
      setFailure('empty');
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const result = await unlock(text);
      if (result.status === 'ok') {
        await markOnboarded();
        navigate(AUTH_ROUTES.home);
        return;
      }
      // Invalid words are explained by the live hint; a wrong key gets its own message. The typed words stay so they can be fixed.
      if (result.status === 'wrong_key') setFailure('wrong_key');
    } catch {
      // Never show the raw error (it could carry details); the person can simply try again.
      setFailure('failed');
    }
    setBusy(false);
  }

  return (
    <main className="np-login">
      <h1>{t('login.title')}</h1>
      <p>{t('login.intro')}</p>

      <form className="np-login__form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className={liveHint || failureText ? 'np-field np-field--error' : 'np-field'}>
          <label className="np-field__label" htmlFor="np-login-words">
            {t('login.label')}
          </label>
          <textarea
            id="np-login-words"
            className="np-field__input np-login__input"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFailure(null);
            }}
            rows={4}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={liveHint || failureText ? true : undefined}
            aria-describedby="np-login-message"
          />
          <div id="np-login-message" className="np-login__message">
            {failureText ? (
              <p role="alert" className="np-field__error">
                <span aria-hidden="true">! </span>
                {failureText}
              </p>
            ) : liveHint ? (
              <p role="status" className="np-field__error">
                <span aria-hidden="true">! </span>
                {liveHint}
              </p>
            ) : null}
          </div>
        </div>

        <div className="np-login__actions">
          <Button variant="secondary" icon={<ArrowLeft size={20} aria-hidden="true" />} disabled={busy} onClick={() => navigate(AUTH_ROUTES.welcome)}>
            {t('login.back')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('login.checking') : t('login.button')}
          </Button>
        </div>
      </form>
    </main>
  );
}
