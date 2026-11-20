import { createHashRouter, type RouteObject } from 'react-router-dom';
import { modules } from './boot';
import { ErrorBoundary } from './ErrorBoundary';
import { IdentityGate } from './IdentityGate';
import { Shell } from './Shell';

// Every module screen is wrapped so that one crashing screen never blanks the app.
function guard(route: RouteObject): RouteObject {
  if (!route.element) return route;
  return { ...route, element: <ErrorBoundary>{route.element}</ErrorBoundary> } as RouteObject;
}

const routesOf = (layout: 'shell' | 'plain'): RouteObject[] =>
  modules
    .filter((m) => (m.layout ?? 'shell') === layout)
    .flatMap((m) => m.routes)
    .map(guard);

// HashRouter works on GitHub Pages without 404 rewrites.
// IdentityGate decides who may see what; app screens sit inside the Shell (bottom navigation), welcome/login screens do not.
export const router = createHashRouter([
  {
    path: '/',
    element: <IdentityGate />,
    children: [{ element: <Shell />, children: routesOf('shell') }, ...routesOf('plain')],
  },
]);
