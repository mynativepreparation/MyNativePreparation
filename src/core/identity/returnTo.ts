import { AUTH_ROUTES } from './status';

// Deep links through the lock screens (owner report 2026-11-22: opening `#/admin` while the app was locked ended on Home).
// The route guard sends a locked person to /pin or /login WITH router state `{ from: '/admin' }`; after a successful unlock the guard and
// the lock screens go to `from` instead of Home. The address travels only in the router state: nothing is stored, nothing is logged.

const AUTH_PATHS: ReadonlySet<string> = new Set(Object.values(AUTH_ROUTES));
const MAX_LENGTH = 200;

/** True for an in-app address that is a real destination: ONE leading slash, not an auth screen, not Home, not absurdly long. */
function isDestination(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (path.length > MAX_LENGTH || !path.startsWith('/') || path.startsWith('//')) return false;
  return !AUTH_PATHS.has(path.replace(/\/+$/, '') || '/');
}

/** The wanted address carried in a router state, or null (no state, wrong shape, an auth screen, a foreign address). */
export function returnPathFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const from = (state as { from?: unknown }).from;
  return isDestination(from) ? from : null;
}

/**
 * The router state to hand to a lock screen: the address already carried, else the address that was asked for.
 * `undefined` means there is nothing worth carrying (the person simply goes Home after unlocking).
 */
export function returnStateFor(currentState: unknown, requestedPath: string): { from: string } | undefined {
  const from = returnPathFrom(currentState) ?? (isDestination(requestedPath) ? requestedPath : null);
  return from === null ? undefined : { from };
}

/** Where to go after a successful unlock: the carried address, otherwise Home. */
export function afterUnlockPath(state: unknown): string {
  return returnPathFrom(state) ?? AUTH_ROUTES.home;
}
