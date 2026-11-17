import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type Theme, THEME_STORAGE_KEY, ThemeContext, THEMES } from './theme-context';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
  } catch {
    return 'system';
  }
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

/** Light, dark, or following the system (live). public/theme.js applies it before first paint. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }, [resolved]);

  const value = useMemo(
    () => ({
      theme,
      resolved,
      setTheme: (next: Theme) => {
        setThemeState(next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // Private mode: the choice lasts for this visit.
        }
      },
    }),
    [theme, resolved],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
