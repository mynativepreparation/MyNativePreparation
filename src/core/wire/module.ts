import type { RouteObject } from 'react-router-dom';
import type { Wire } from './wire';

// Every feature folder in src/modules/<id>/index.tsx default-exports one AppModule.
export interface AppModule {
  id: string;
  routes: RouteObject[];
  /**
   * 'shell' (default): screens appear inside the app frame with the bottom navigation.
   * 'plain': full-screen pages without navigation (welcome, register, login ...).
   */
  layout?: 'shell' | 'plain';
  init?: (wire: Wire) => void;
}
