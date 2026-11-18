import { createHashRouter, type RouteObject } from 'react-router-dom';
import { modules } from './boot';
import { ErrorBoundary } from './ErrorBoundary';
import { Shell } from './Shell';

// Every module screen is wrapped so that one crashing screen never blanks the app.
function guard(route: RouteObject): RouteObject {
  if (!route.element) return route;
  return { ...route, element: <ErrorBoundary>{route.element}</ErrorBoundary> } as RouteObject;
}

// HashRouter works on GitHub Pages without 404 rewrites.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: modules.flatMap((m) => m.routes).map(guard),
  },
]);
