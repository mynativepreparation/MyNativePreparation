import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { setUpdateState } from './updateStore';

/**
 * Registers the service worker ONCE for the whole app (mount it once, in main.tsx) and feeds the update store.
 * Two components calling `useRegisterSW` would register twice and could reload the page twice, so nobody else calls it.
 * Renders nothing.
 */
export function UpdateRegistrar(): null {
  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      setUpdateState({ registration });
    },
    onNeedRefresh() {
      setUpdateState({ needRefresh: true });
    },
  });

  useEffect(() => {
    setUpdateState({ apply: () => updateServiceWorker(true) });
  }, [updateServiceWorker]);

  return null;
}
