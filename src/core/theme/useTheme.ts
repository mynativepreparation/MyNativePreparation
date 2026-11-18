import { useSyncExternalStore } from 'react';
import type { ThemeName } from '../ui/tokens';
import { getThemeMode, resolveTheme, setThemeMode, subscribeTheme, type ThemeMode } from './theme';

export function useTheme(): { mode: ThemeMode; resolved: ThemeName; setMode: (mode: ThemeMode) => void } {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, () => 'system' as ThemeMode);
  return { mode, resolved: resolveTheme(mode), setMode: setThemeMode };
}
