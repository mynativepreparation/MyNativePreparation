import { useSyncExternalStore } from 'react';
import { getUpdateState, subscribeUpdate, type UpdateState } from './updateStore';

/** The app's service worker state; the component re-renders when it changes. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdate, getUpdateState);
}
