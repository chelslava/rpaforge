import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { NAMESPACES, I18nConfig } from './types';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

const config: I18nConfig = {
  supportedLanguages: SUPPORTED_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE,
  namespaces: NAMESPACES,
};

// Locale files are bundled into the app at build time instead of being fetched
// over HTTP. Under Electron's file:// protocol an HTTP backend cannot resolve
// '/locales/...' (it points at the filesystem root), which froze the app on
// startup. Bundling makes translations available synchronously and offline.
const localeModules = import.meta.glob<Record<string, unknown>>(
  '../../public/locales/**/*.json',
  { eager: true, import: 'default' }
);

const resources: Record<string, Record<string, unknown>> = {};
for (const filePath in localeModules) {
  const match = filePath.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  resources[lng] ??= {};
  resources[lng][ns] = localeModules[filePath];
}

type I18nWithPlugins = typeof i18n & {
  language: string;
  changeLanguage(lang: string): Promise<void>;
  use(plugin: unknown): I18nWithPlugins;
  init(options: unknown): I18nWithPlugins;
};

(i18n as I18nWithPlugins)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: config.supportedLanguages,
    ns: config.namespaces,
    defaultNS: 'common',
    lng: config.defaultLanguage,
    react: {
      // Resources are bundled (synchronous), so suspense is unnecessary and
      // would only risk freezing the tree if a namespace were ever missing.
      useSuspense: false,
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em', 'p', 'a', 'b', 'i', 'u'],
    },
    interpolation: {
      escapeValue: false,
      formatSeparator: ',',
      format(value: string, format?: string): string {
        if (format === 'uppercase') return value.toUpperCase();
        return value;
      },
    },
    detection: {
      order: ['localStorage', 'navigator', 'querystring', 'cookie'],
      caches: ['localStorage'],
      lookupQuerystring: 'lang',
      lookupCookie: 'i18next',
      lookupLocalStorage: 'i18nextLng',
      detectFromCookiesHeader: true,
    },
    debug: import.meta.env.DEV,
    returnNull: false,
    returnEmptyString: true,
    returnObjects: false,
  });

export { config };
export default i18n as I18nWithPlugins;