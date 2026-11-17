import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useTheme } from './theme-context';
import { ThemeProvider } from './ThemeProvider';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);
const isDark = () => document.documentElement.classList.contains('dark');

/** A matchMedia whose dark-mode answer the test can change. */
function mockSystemDark(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    matches = next;
    listeners.forEach((listener) => listener());
  };
}

describe('ThemeProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the system by default, live', () => {
    const setSystemDark = mockSystemDark(false);
    const { result } = renderHook(useTheme, { wrapper });
    expect(result.current).toMatchObject({ theme: 'system', resolved: 'light' });
    expect(isDark()).toBe(false);

    act(() => setSystemDark(true));
    expect(result.current.resolved).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('applies and remembers an explicit choice', () => {
    mockSystemDark(false);
    const { result } = renderHook(useTheme, { wrapper });
    act(() => result.current.setTheme('dark'));
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('starts from the stored choice and ignores junk', () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(renderHook(useTheme, { wrapper }).result.current.resolved).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(renderHook(useTheme, { wrapper }).result.current.theme).toBe('system');
  });
});
