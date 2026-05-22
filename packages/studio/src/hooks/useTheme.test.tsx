import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useSettingsStore, type ThemeMode } from '../stores/settingsStore';
import { applyThemeToDocument, resolveTheme, useThemeController } from './useTheme';

type MediaListener = () => void;

function installMatchMediaMock(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<MediaListener>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_event: string, listener: MediaListener) => listeners.add(listener),
      removeEventListener: (_event: string, listener: MediaListener) => listeners.delete(listener),
      addListener: (listener: MediaListener) => listeners.add(listener),
      removeListener: (listener: MediaListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    })),
  });

  return {
    listeners,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('theme utilities', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    useSettingsStore.setState({ theme: 'system' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] satisfies Array<[ThemeMode, boolean, 'light' | 'dark']>)(
    'resolves %s with prefersDark=%s to %s',
    (theme, prefersDark, expected) => {
      expect(resolveTheme(theme, prefersDark)).toBe(expected);
    }
  );

  test('applies resolved theme state to the document root', () => {
    expect(applyThemeToDocument('dark', false)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    expect(applyThemeToDocument('system', false)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  test('updates system theme when the media query changes and removes listeners on unmount', () => {
    const media = installMatchMediaMock(false);
    useSettingsStore.setState({ theme: 'system' });

    const { result, unmount } = renderHook(() => useThemeController());

    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(media.listeners.size).toBe(1);

    act(() => media.setMatches(true));

    expect(result.current).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
