import React, { useEffect } from 'react';
import { FiSettings, FiGlobe, FiMonitor, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type ThemeMode } from '../../stores/settingsStore';
import i18n from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/config';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation('common');
  const { language, theme, setLanguage, setTheme } = useSettingsStore();

  const THEME_OPTIONS = [
    { value: 'light', label: t('settings.theme_light') },
    { value: 'dark', label: t('settings.theme_dark') },
    { value: 'system', label: t('settings.theme_system') },
  ] as const;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSetLanguage = (lang: 'en' | 'ru' | 'de') => {
    setLanguage(lang);
    void i18n.changeLanguage(lang);
  };

  const handleSetTheme = (newTheme: ThemeMode) => setTheme(newTheme);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Settings"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FiSettings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.title', 'Settings')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FiGlobe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.language', 'Language')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleSetLanguage(lang)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    language === lang
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  {lang === 'en' ? t('settings.languageEnglish') : lang === 'ru' ? t('settings.languageRussian') : t('settings.languageGerman', 'Deutsch')}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <FiMonitor className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.theme', 'Theme')}
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSetTheme(option.value)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    theme === option.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            {t('settings.restartNote', 'Settings are saved automatically.')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
