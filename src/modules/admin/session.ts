// Admin session (P10 T5, DECISIONS Q24): the GitHub token lives ONLY in this module variable, in memory.
// It is never written to localStorage, sessionStorage, IndexedDB, the encrypted store, a cookie or a log, and it is never
// rendered. A reload or closing the tab ends the session. Only the non-secret repository info is exposed to screens.

export interface AdminInfo {
  /** `owner/name` of the content repository, as GitHub reports it. */
  fullName: string;
  defaultBranch: string;
  /** False when the repository's default branch differs from `CONTENT_REPO.branch`. */
  branchOk: boolean;
}

interface SessionState {
  token: string;
  info: AdminInfo;
}

let state: SessionState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function login(token: string, info: AdminInfo): void {
  state = { token, info };
  emit();
}

export function logout(): void {
  state = null;
  emit();
}

/** For code that calls GitHub. Never pass the result to a screen, a log or a store. */
export function getToken(): string | null {
  return state === null ? null : state.token;
}

/** Stable between changes (safe for `useSyncExternalStore`). */
export function getInfo(): AdminInfo | null {
  return state === null ? null : state.info;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
