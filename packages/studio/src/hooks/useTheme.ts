import { useEffect, useState } from 'react';
import { useSettingsStore, type ResolvedTheme, type ThemeMode } from '../stores/settingsStore';

const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const FORCED_COLORS_MEDIA_QUERY = '(forced-colors: active)';
type MediaQueryChangeHandler = () => void;

function addMediaQueryListener(mediaQuery: MediaQueryList, handler: MediaQueryChangeHandler): () => void {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }

  mediaQuery.addListener(handler);
  return () => mediaQuery.removeListener(handler);
}

export function resolveTheme(theme: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}

export function applyThemeToDocument(theme: ThemeMode, prefersDark: boolean): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme, prefersDark);
  const root = document.documentElement;

  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    return addMediaQueryListener(mediaQuery, handleChange);
  }, [query]);

  return matches;
}

export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettingsStore((state) => state.theme);
  const prefersDark = useMediaQuery(THEME_MEDIA_QUERY);

  return resolveTheme(theme, prefersDark);
}

export function useForcedColors(): boolean {
  return useMediaQuery(FORCED_COLORS_MEDIA_QUERY);
}

export function useThemeController(): ResolvedTheme {
  const theme = useSettingsStore((state) => state.theme);
  const prefersDark = useMediaQuery(THEME_MEDIA_QUERY);
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useEffect(() => {
    applyThemeToDocument(theme, prefersDark);
  }, [prefersDark, theme]);

  return resolvedTheme;
}
