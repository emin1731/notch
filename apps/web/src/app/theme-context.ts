import { createContext, useContext } from 'react';

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** The same key public/theme.js reads before the app loads. */
export const THEME_STORAGE_KEY = 'notch-theme';

export interface ThemeState {
  theme: Theme;
  /** What's on screen: `system` resolved to light or dark. */
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return state;
}
