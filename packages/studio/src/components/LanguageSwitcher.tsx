import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTranslationContext } from './TranslationProvider';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
] as const;

export const LanguageSwitcher = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useTranslationContext();

  const handleLanguageChange = useCallback(
    (lang: string) => {
      setLanguage(lang);
    },
    [setLanguage]
  );

  return (
    <div className="relative">
      <select
        value={language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
        title={t('language.select', { defaultValue: 'Select language' })}
        aria-label={t('language.select', { defaultValue: 'Select language' })}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
        <svg
          className="w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};
