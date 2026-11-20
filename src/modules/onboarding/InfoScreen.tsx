import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../core/i18n';
import { AUTH_ROUTES } from '../../core/identity/status';
import { saveProfile, type Profile } from '../../core/storage/repo';
import { Button, TextField } from '../../core/ui';
import './InfoScreen.css';

// Light check only: something@something.something with no spaces. Real validation is impossible without sending mail.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps only the fields the person really filled in (trimmed). Empty fields are left out of the profile. */
function buildProfile(name: string, email: string, phone: string): Profile {
  const profile: Profile = {};
  if (name.trim()) profile.name = name.trim();
  if (email.trim()) profile.email = email.trim();
  if (phone.trim()) profile.phone = phone.trim();
  return profile;
}

// Basic info (P04 T9): name, email and phone are ALL optional. Skip goes on without saving anything.
// Save writes through repo.saveProfile (encrypted there); the app works the same without these details.
export function InfoScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const profile = buildProfile(name, email, phone);
    if (profile.email !== undefined && !EMAIL_SHAPE.test(profile.email)) {
      setEmailInvalid(true);
      return;
    }
    // Nothing filled in: same as Skip, and no empty profile is written.
    if (Object.keys(profile).length === 0) {
      navigate(AUTH_ROUTES.privacy);
      return;
    }

    setBusy(true);
    setFailed(false);
    try {
      await saveProfile(profile);
      navigate(AUTH_ROUTES.privacy);
      return;
    } catch {
      // Never show the raw error; the person can try again or skip.
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <main className="np-info">
      <h1>{t('info.title')}</h1>
      <p>{t('info.intro')}</p>

      <form className="np-info__form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label={t('info.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          type="text"
          autoComplete="name"
          maxLength={100}
        />
        <TextField
          label={t('info.email')}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailInvalid(false);
          }}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={254}
          error={emailInvalid ? t('info.emailInvalid') : undefined}
        />
        <TextField
          label={t('info.phone')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
        />

        {failed && (
          <p role="alert" className="np-info__error">
            <span aria-hidden="true">! </span>
            {t('info.saveFailed')}
          </p>
        )}

        <div className="np-info__actions">
          <Button variant="secondary" disabled={busy} onClick={() => navigate(AUTH_ROUTES.privacy)}>
            {t('info.skip')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('info.save')}
          </Button>
        </div>
      </form>
    </main>
  );
}
