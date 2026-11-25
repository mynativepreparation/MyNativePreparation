import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { verifyToken, type GithubErrorCode, type GithubFetch } from '../../core/admin/github';
import { t, type TextKey } from '../../core/i18n';
import { Button, Card, TextField } from '../../core/ui';
import { login } from './session';
import './LoginScreen.css';

// Admin login (P10 T5, DECISIONS Q24): the person pastes a GitHub fine-grained token. It is checked with GitHub
// (`verifyToken`: valid AND allowed to push to the content repo). The token is cleared from the field right after the
// check, handed to the in-memory session only, and never shown, stored or logged. Errors are friendly texts, never raw.

const ERROR_TEXT: Record<GithubErrorCode, TextKey> = {
  invalid_token: 'admin.err.invalidToken',
  unauthorized: 'admin.err.unauthorized',
  forbidden: 'admin.err.forbidden',
  no_push_right: 'admin.err.noPush',
  rate_limited: 'admin.err.rateLimited',
  not_found: 'admin.err.notFound',
  offline: 'admin.err.offline',
  timeout: 'admin.err.timeout',
  bad_response: 'admin.err.badResponse',
  bad_path: 'admin.err.badResponse',
  too_large: 'admin.err.badResponse',
  // Friendly publish texts come with the Publish UI (P11 T5 / T6).
  conflict: 'admin.err.badResponse',
};

const realFetch: GithubFetch = (url, init) => fetch(url, init);

interface LoginScreenProps {
  /** Tests pass a fake; the app uses the browser's fetch. */
  fetchImpl?: GithubFetch | undefined;
}

export function LoginScreen({ fetchImpl = realFetch }: LoginScreenProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const token = value.trim();
    const result = await verifyToken(token, { fetch: fetchImpl });
    setBusy(false);
    if (result.ok) {
      setValue('');
      login(token, {
        fullName: result.fullName,
        defaultBranch: result.defaultBranch,
        branchOk: result.branchOk,
      });
    } else {
      setError(ERROR_TEXT[result.code]);
    }
  }

  return (
    <Card className="np-admin-login">
      <h2 className="np-admin-login__title">
        <KeyRound size={22} aria-hidden="true" />
        {t('admin.login.title')}
      </h2>
      <p className="np-admin-login__text">{t('admin.login.intro')}</p>
      <form className="np-admin-login__form" onSubmit={(e) => void onSubmit(e)}>
        <TextField
          label={t('admin.login.token')}
          hint={t('admin.login.hint')}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />
        {busy && (
          <p role="status" className="np-admin-login__text">
            {t('admin.login.checking')}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="np-admin-login__error">
            <span aria-hidden="true">! </span>
            {t(error)}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {t('admin.login.submit')}
        </Button>
      </form>
    </Card>
  );
}
