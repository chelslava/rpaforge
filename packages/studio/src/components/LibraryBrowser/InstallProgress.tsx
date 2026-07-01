import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX, FiCheckCircle } from 'react-icons/fi';

interface InstallProgressProps {
  isOpen: boolean;
  libraryName: string;
  isInstalling: boolean;
  progress: number; // 0-100
  status: 'idle' | 'installing' | 'success' | 'error';
  errorMessage?: string;
  onClose: () => void;
}

export function InstallProgress({
  isOpen,
  libraryName,
  isInstalling,
  progress,
  status,
  errorMessage,
  onClose,
}: InstallProgressProps) {
  const { t } = useTranslation();
  const [displayProgress, setDisplayProgress] = useState(progress);

  useEffect(() => {
    if (isInstalling) {
      const timer = setTimeout(() => {
        setDisplayProgress(Math.min(progress, 95));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [progress, isInstalling]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-ui-surface rounded-lg shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ui-text">
            {status === 'success' ? t('libraries.installed') : status === 'error' ? t('libraries.error') : t('libraries.installing')}
          </h3>
          {!isInstalling && (
            <button
              className="p-1 rounded hover:bg-ui-surface-hover"
              onClick={onClose}
            >
              <FiX className="w-5 h-5 text-ui-text-muted" />
            </button>
          )}
        </div>

        <div className="mb-4">
          <p className="text-sm text-ui-text-muted mb-2">{libraryName}</p>

          {isInstalling && (
            <>
              <div className="w-full bg-ui-border rounded-full h-2 overflow-hidden">
                <div
                  className="bg-ui-primary h-full transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <p className="text-xs text-ui-text-subtle mt-2">{displayProgress}%</p>
            </>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <FiCheckCircle className="w-5 h-5" />
              <span className="text-sm">{t('libraries.installSuccess')}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="text-red-600 dark:text-red-400">
              <p className="text-sm font-semibold mb-1">{t('libraries.installationFailed')}</p>
              {errorMessage && (
                <p className="text-xs text-ui-text-muted">{errorMessage}</p>
              )}
            </div>
          )}
        </div>

        {!isInstalling && (
          <button
            className="w-full px-4 py-2 bg-ui-primary rounded hover:bg-ui-primary-hover text-ui-text-inverse transition-colors"
            onClick={onClose}
          >
            {status === 'success' ? t('actions.ok') : t('actions.close')}
          </button>
        )}
      </div>
    </div>
  );
}

export default InstallProgress;
