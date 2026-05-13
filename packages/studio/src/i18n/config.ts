import type { Language } from './types';

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'ru'];
export const DEFAULT_LANGUAGE: Language = 'en';
export const FALLBACK_LANGUAGE = 'en';

export const I18N_CONFIG = {
  defaultLanguage: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES,
  fallbackLanguage: FALLBACK_LANGUAGE,
  backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
  react: { useSuspense: true },
  detection: { order: ['localStorage', 'navigator', 'querystring', 'cookie'], caches: ['localStorage'] },
} as const;