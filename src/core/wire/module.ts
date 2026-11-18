import type { RouteObject } from 'react-router-dom';
import type { Wire } from './wire';

// Every feature folder in src/modules/<id>/index.tsx default-exports one AppModule.
export interface AppModule {
  id: string;
  routes: RouteObject[];
  init?: (wire: Wire) => void;
}
