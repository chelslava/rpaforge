import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FiSettings, FiGlobe, FiMonitor, FiX, FiZap, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useSettingsStore, type ThemeMode } from '../../stores/settingsStore';
import i18n from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/config';
import type { Language } from '../../i18n/types';
import type { AiProviderId, AiProviderStatus } from '../../types/ai';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const AI_PROVIDER_IDS: AiProviderId[] = ['openai-compatible', 'anthropic', 'ollama', 'groq', 'gemini', 'openrouter', 'mistral', 'nvidia-nim'];

/** Default base URL pre-filled for known preset providers. */
const PROVIDER_DEFAULT_BASE_URL: Partial<Record<AiProviderId, string>> = {
  ollama: 'http://localhost:11434/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  nvidia-nim: 'https://integrate.api.nvidia.com/v1',
  // Gemini uses Google's official endpoint; baseUrl is not needed for gemini-1.5-pro/gemini-2.0-flash
};

/** Suggested model name placeholder shown for preset providers. */
const PROVIDER_MODEL_PLACEHOLDER: Partial<Record<AiProviderId, string>> = {
  ollama: 'e.g. llama3, mistral, gemma2',
  groq: 'e.g. mixtral-8x7b-32768, llama3-70b-8192',
  openrouter: 'e.g. openai/gpt-4o-mini, anthropic/claude-3.5-haiku',
  mistral: 'e.g. mistral-large-latest, mistral-small-latest',
  nvidia-nim: 'e.g. meta/llama-3.1-70b-instruct, mistralai/mistral-7b-instruct',
  gemini: 'e.g. gemini-1.5-pro, gemini-2.0-flash',
};

interface AiProviderRowProps {
  provider: AiProviderId;
  label: string;
  configured: boolean;
  onChanged: () => void;
}

const AiProviderRow: React.FC<AiProviderRowProps> = ({ provider, label, configured, onChanged }) => {
  const { t } = useTranslation('common');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULT_BASE_URL[provider] ?? '');
  const [model, setModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setTestResult(null);
    try {
      await window.rpaforge?.ai.setProviderKey({
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
      });
      setApiKey('');
      onChanged();
      toast.success(t('settings.aiProviderSaved'));
    } catch {
      toast.error(t('settings.aiProviderSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    try {
      await window.rpaforge?.ai.removeProviderKey(provider);
      setTestResult(null);
      onChanged();
      toast.success(t('settings.aiProviderRemoved'));
    } catch {
      toast.error(t('settings.aiProviderRemoveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await window.rpaforge?.ai.testProvider(provider);
      setTestResult(result?.ok ? 'ok' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className={`text-xs ${configured ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
          {configured ? t('settings.aiProviderConfigured') : t('settings.aiProviderNotConfigured')}
        </span>
      </div>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={configured ? t('settings.aiProviderKeyPlaceholderConfigured') : t('settings.aiProviderKeyPlaceholder')}
        className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={t('settings.aiProviderBaseUrlPlaceholder')}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
        />
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={PROVIDER_MODEL_PLACEHOLDER[provider] ?? t('settings.aiProviderModelPlaceholder')}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !apiKey.trim()}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('settings.aiProviderSave')}
        </button>
        {configured && (
          <button
            onClick={handleRemove}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {t('settings.aiProviderRemove')}
          </button>
        )}
        <button
          onClick={handleTest}
          disabled={isTesting || !configured}
          className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? t('settings.aiProviderTesting') : t('settings.aiProviderTest')}
        </button>
        {testResult === 'ok' && <FiCheck className="w-4 h-4 text-green-600 dark:text-green-400" aria-label={t('settings.aiProviderTestOk')} />}
        {testResult === 'error' && <FiAlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" aria-label={t('settings.aiProviderTestFailed')} />}
      </div>
    </div>
  );
};

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation('common');
  const { language, theme, setLanguage, setTheme } = useSettingsStore();
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus[]>([]);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  const refreshProviderStatus = async () => {
    try {
      const status = await window.rpaforge?.ai.getProviderStatus();
      setProviderStatus(status ?? []);
    } catch {
      setProviderStatus([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    // Defer to a microtask so the effect body doesn't call setState synchronously
    // (refreshProviderStatus does) — same pattern as useDesigner.ts's refreshActivities.
    void Promise.resolve().then(() => refreshProviderStatus());
  }, [open]);

  const THEME_OPTIONS = [
    { value: 'light', label: t('settings.theme_light') },
    { value: 'dark', label: t('settings.theme_dark') },
    { value: 'system', label: t('settings.theme_system') },
  ] as const;

  const LANGUAGE_OPTIONS: { value: Language; label: string }[] = SUPPORTED_LANGUAGES.map((lang) => {
    let label: string;
    switch (lang) {
      case 'en':
        label = t('settings.languageEnglish', 'English');
        break;
      case 'ru':
        label = t('settings.languageRussian', 'Русский');
        break;
      case 'de':
        label = t('settings.languageGerman', 'Deutsch');
        break;
      case 'es':
        label = t('settings.languageSpanish', 'Español');
        break;
      case 'zh':
        label = t('settings.languageChinese', '中文');
        break;
      default:
        label = t('settings.languageEnglish', 'English');
    }
    return { value: lang, label };
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    void i18n.changeLanguage(lang);
  };

  const handleSetTheme = (newTheme: ThemeMode) => setTheme(newTheme);

  if (!open) return null;

  return (
    <div
      ref={focusTrapRef}
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
            <select
              value={language}
              onChange={(e) => handleSetLanguage(e.target.value as Language)}
              className="w-full appearance-none px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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

          <section>
            <div className="flex items-center gap-2 mb-3">
              <FiZap className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('settings.aiProviders', 'AI Providers')}
              </h3>
            </div>
            <div className="space-y-3">
               {AI_PROVIDER_IDS.map((provider) => {
                 const labelKey: Record<AiProviderId, string> = {
                   'openai-compatible': t('aiGenerate.providerOpenAi'),
                   anthropic: t('aiGenerate.providerAnthropic'),
                   ollama: t('aiGenerate.providerOllama'),
                   groq: t('aiGenerate.providerGroq'),
                   gemini: t('aiGenerate.providerGemini'),
                   openrouter: t('aiGenerate.providerOpenRouter'),
                   mistral: t('aiGenerate.providerMistral'),
                   nvidia-nim: t('aiGenerate.providerNvidiaNim'),
                 };
                 return (
                  <AiProviderRow
                    key={provider}
                    provider={provider}
                    label={labelKey[provider]}
                    configured={providerStatus.find((status) => status.provider === provider)?.configured ?? false}
                    onChanged={refreshProviderStatus}
                  />
                );
              })}
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
