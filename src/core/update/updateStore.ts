import type { UpdateRegistration } from './checkForUpdate';

// The one place that knows the app's service worker state (P09). UpdateRegistrar writes it, UpdatePrompt and the Settings
// "Update app" card read it. A tiny external store, no React here (the hook is in useUpdateState.ts).

export interface UpdateState {
  /** Set once the service worker is registered. Stays undefined on the dev server and in browsers without a service worker. */
  registration: UpdateRegistration | undefined;
  /** True when a new version is installed and waiting. */
  needRefresh: boolean;
  /** Switches to the waiting version and reloads the page (local data stays). Set once the app is registered. */
  apply: (() => Promise<void>) | undefined;
}

const INITIAL: UpdateState = { registration: undefined, needRefresh: false, apply: undefined };

let state: UpdateState = INITIAL;
const listeners = new Set<() => void>();

export function getUpdateState(): UpdateState {
  return state;
}

/** Merges the given fields into the state and tells every listener. */
export function setUpdateState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Returns a function that stops listening. */
export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Back to the start state. For tests. */
export function resetUpdateState(): void {
  state = INITIAL;
  listeners.forEach((listener) => listener());
}
