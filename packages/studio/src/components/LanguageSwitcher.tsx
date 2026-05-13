import { useCallback } from 'react';
import { useTranslationContext } from './TranslationProvider';

export const LanguageSwitcher = () => {
  const { language, setLanguage } = useTranslationContext();

  const handleLanguageChange = useCallback(
    (lang: 'en' | 'ru') => {
      setLanguage(lang);
    },
    [setLanguage]
  );

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleLanguageChange('en')}
        className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
          language === 'en'
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => handleLanguageChange('ru')}
        className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
          language === 'ru'
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        RU
      </button>
    </div>
  );
};
