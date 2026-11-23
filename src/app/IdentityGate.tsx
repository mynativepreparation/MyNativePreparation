import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { t } from '../core/i18n';
import { afterUnlockPath, returnStateFor } from '../core/identity/returnTo';
import { AUTH_ROUTES, decideRoute, loadIdentityStatus, type IdentityStatus } from '../core/identity/status';
import { wire } from '../core/wire/wire';

// The route guard (P04 T6): first run -> Welcome, logged in -> the app, onboarded but locked -> Login.
// It reads the state once at app open (restoring the saved login without the 12 words, Q16) and then follows the wire events.
export function IdentityGate() {
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const { pathname, state } = useLocation();

  useEffect(() => {
    let cancelled = false;
    void loadIdentityStatus().then((loaded) => {
      if (!cancelled) setStatus(loaded);
    });
    // Events that arrive before the first read finishes are ignored: the read result already includes them.
    const stops = [
      // A PIN unlock or a login ends the "PIN screen" state, so a later Log out goes to Login and not back to the PIN screen.
      wire.on('identity:unlocked', () => setStatus((s) => (s ? { unlocked: true, onboarded: s.onboarded } : s))),
      wire.on('identity:locked', () => setStatus((s) => (s ? { unlocked: false, onboarded: s.onboarded } : s))),
      wire.on('identity:onboarded', () => setStatus((s) => (s ? { ...s, onboarded: true } : s))),
    ];
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, []);

  if (!status) return <p role="status">{t('gate.loading')}</p>;

  const target = decideRoute(status, pathname);
  if (target) {
    // Leaving a lock screen for Home: go to the address that was asked for before the lock (a deep link such as #/admin), if there is one.
    if (target === AUTH_ROUTES.home) return <Navigate to={afterUnlockPath(state)} replace />;
    // A locked person is sent to the lock screen WITH the wanted address, so it is not lost after unlocking.
    return <Navigate to={target} replace state={status.unlocked ? undefined : returnStateFor(state, pathname)} />;
  }
  return <Outlet />;
}
