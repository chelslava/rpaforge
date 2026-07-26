import { beforeEach, describe, expect, test } from 'vitest';

import {
  WELCOME_PREFERENCE_KEY,
  hasDismissedWelcome,
  markWelcomeDismissed,
  resetWelcomePreference,
} from './storage';

describe('welcome preference storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('persists the preference and reads it after a reload', () => {
    expect(hasDismissedWelcome()).toBe(false);

    markWelcomeDismissed();
    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBe('1');

    expect(hasDismissedWelcome()).toBe(true);
  });

  test('resets the preference', () => {
    markWelcomeDismissed();

    resetWelcomePreference();

    expect(localStorage.getItem(WELCOME_PREFERENCE_KEY)).toBeNull();
    expect(hasDismissedWelcome()).toBe(false);
  });
});
