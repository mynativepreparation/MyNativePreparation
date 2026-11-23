import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, getThemeMode, setThemeMode, subscribeTheme, type ThemeMode } from './theme';

export function useTheme(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, () => DEFAULT_THEME);
  return { mode, setMode: setThemeMode };
}
