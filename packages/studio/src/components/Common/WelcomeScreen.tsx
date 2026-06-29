import { useState } from 'react';
import { FiArchive, FiFolder, FiFolderPlus, FiPlay, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

interface WelcomeScreenProps {
  onNewProcess: () => void;
  onOpenProcess: () => void;
  onDismiss: () => void;
  onImportMermaid?: () => void;
  onBrowseLibraries?: () => void;
  onGettingStarted?: () => void;
}

export function WelcomeScreen({ onNewProcess, onOpenProcess, onDismiss, onImportMermaid, onBrowseLibraries, onGettingStarted }: WelcomeScreenProps) {
  const { t } = useTranslation('common');
  const [dontShow, setDontShow] = useState(false);

  const handleDismiss = () => {
    if (dontShow) localStorage.setItem('rpaforge_welcomed', '1');
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-8 relative flex flex-col max-h-[90vh]">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <FiX className="w-5 h-5" />
        </button>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FiPlay className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            {t('welcome.title')}
          </h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>{t('welcome.version', { version: 'v0.4.0' })}</span>
          </div>
        </div>
        
        <div className="overflow-y-auto mb-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-2">
              {t('welcome.recentProjects')}
            </h2>
            <div className="bg-slate-50 dark:bg-slate-700/30 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center">
              <FiArchive className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('welcome.noRecentProjects')}
              </p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <button
              onClick={() => {
                handleDismiss();
                onNewProcess();
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left"
            >
              <FiFolderPlus className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {t('welcome.newProcess')}
                </div>
                <div className="text-xs text-slate-500">{t('welcome.startWithBlank')}</div>
              </div>
            </button>
            <button
              onClick={() => {
                handleDismiss();
                onOpenProcess();
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
            >
              <FiFolder className="w-5 h-5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-100">
                  {t('welcome.openProcess')}
                </div>
                <div className="text-xs text-slate-500">{t('welcome.browseSaved')}</div>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {onImportMermaid && (
              <button
                onClick={() => {
                  handleDismiss();
                  onImportMermaid();
                }}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                <FiArchive className="w-5 h-5 text-slate-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('welcome.importMermaid')}
                </span>
              </button>
            )}
            {onBrowseLibraries && (
              <button
                onClick={() => {
                  handleDismiss();
                  onBrowseLibraries();
                }}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                <FiFolder className="w-5 h-5 text-slate-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('welcome.browseLibraries')}
                </span>
              </button>
            )}
            {onGettingStarted && (
              <button
                onClick={() => {
                  handleDismiss();
                  onGettingStarted();
                }}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                <FiPlay className="w-5 h-5 text-indigo-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('welcome.gettingStarted')}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            id="dont-show"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="dont-show">{t('welcome.dontShowAgain')}</label>
        </div>
      </div>
    </div>
  );
}
