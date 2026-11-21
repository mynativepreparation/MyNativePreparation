import { useEffect, useState, type FormEvent } from 'react';
import { User } from 'lucide-react';
import { t, type TextKey } from '../../core/i18n';
import { buildProfile, EMAIL_SHAPE } from '../../core/identity/profileInput';
import { getProfile, saveProfile } from '../../core/storage/repo';
import { Button, Card, TextField } from '../../core/ui';
import './ProfileCard.css';

// Profile card (SPEC C7, P09 T3): name, email and phone, ALL optional, prefilled from the encrypted profile.
// The input rule (trim, drop empty fields, light email check) is the same one onboarding uses (core/identity/profileInput).
// Save writes through repo.saveProfile; an empty form saves an empty profile (the fields are removed).
// The card loads on its own and never blocks the rest of the screen. Raw errors are never shown, and the details are never logged.
// It is not placed in the Settings screen here (that is P09 T5).
type Load = 'loading' | 'ready' | 'failed';
type Outcome = 'saved' | 'savedEmpty' | 'saveFailed';

const OUTCOME_TEXT: Record<Outcome, TextKey> = {
  saved: 'profile.saved',
  savedEmpty: 'profile.savedEmpty',
  saveFailed: 'profile.saveFailed',
};

export function ProfileCard() {
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();

  // Loads the saved profile once (again only when the person taps "Try again").
  useEffect(() => {
    let cancelled = false;
    getProfile().then(
      (profile) => {
        if (cancelled) return;
        setName(profile?.name ?? '');
        setEmail(profile?.email ?? '');
        setPhone(profile?.phone ?? '');
        setLoad('ready');
      },
      () => {
        // Locked, unreadable or anything else: one friendly text, never the raw error.
        if (!cancelled) setLoad('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setLoad('loading');
    setAttempt((n) => n + 1);
  }

  function edit(setValue: (value: string) => void, value: string) {
    setValue(value);
    setOutcome(undefined);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const profile = buildProfile(name, email, phone);
    if (profile.email !== undefined && !EMAIL_SHAPE.test(profile.email)) {
      setEmailInvalid(true);
      setOutcome(undefined);
      return;
    }

    setSaving(true);
    setOutcome(undefined);
    try {
      await saveProfile(profile);
      setOutcome(Object.keys(profile).length === 0 ? 'savedEmpty' : 'saved');
    } catch {
      setOutcome('saveFailed');
    }
    setSaving(false);
  }

  return (
    <Card className="np-profile">
      <h2 id="np-profile-title" className="np-profile__title">
        <User size={22} aria-hidden="true" />
        {t('profile.title')}
      </h2>
      <p className="np-profile__body">{t('profile.body')}</p>

      {load === 'loading' && (
        <p role="status" className="np-profile__loading">
          {t('profile.loading')}
        </p>
      )}

      {load === 'failed' && (
        <div className="np-profile__problem">
          <p role="alert" className="np-profile__error">
            <span aria-hidden="true">! </span>
            {t('profile.loadFailed')}
          </p>
          <Button variant="secondary" onClick={retry}>
            {t('profile.retry')}
          </Button>
        </div>
      )}

      {load === 'ready' && (
        <form className="np-profile__form" noValidate onSubmit={(event) => void onSubmit(event)}>
          <TextField
            label={t('info.name')}
            value={name}
            onChange={(event) => edit(setName, event.target.value)}
            type="text"
            autoComplete="name"
            maxLength={100}
          />
          <TextField
            label={t('info.email')}
            value={email}
            onChange={(event) => {
              edit(setEmail, event.target.value);
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
            onChange={(event) => edit(setPhone, event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
          />
          <p className="np-profile__status" role="status" aria-live="polite">
            {outcome === 'saveFailed' ? <span aria-hidden="true">! </span> : null}
            {outcome ? t(OUTCOME_TEXT[outcome]) : null}
          </p>
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {t('profile.save')}
          </Button>
        </form>
      )}
    </Card>
  );
}
