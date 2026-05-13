import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

import { NAMESPACES, I18nConfig } from './types';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

const config: I18nConfig = {
  supportedLanguages: SUPPORTED_LANGUAGES,
  defaultLanguage: DEFAULT_LANGUAGE,
  namespaces: NAMESPACES,
};

type I18nWithPlugins = typeof i18n & {
  language: string;
  changeLanguage(lang: string): Promise<void>;
  use(plugin: unknown): I18nWithPlugins;
  init(options: unknown): I18nWithPlugins;
};

(i18n as I18nWithPlugins)
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: config.supportedLanguages,
    ns: config.namespaces,
    defaultNS: 'common',
    lng: config.defaultLanguage,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
      crossDomain: false,
      allowMultiLoading: false,
      customHeaders: {},
      format: (lng: string, ns: string) => `${lng}/${ns}.json`,
    },
    react: {
      useSuspense: true,
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