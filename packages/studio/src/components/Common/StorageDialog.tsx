import { FiDatabase, FiTrash2, FiRefreshCw, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useStorageStats } from '../../hooks/useStorageStats';
import { formatBytes } from '../../utils/storage';

interface StorageDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY_LABELS: Record<string, string> = {
  'rpaforge-diagrams': 'diagrams',
  'rpaforge-process': 'process',
  'rpaforge-files': 'files',
  'rpaforge-settings': 'settings',
  'rpaforge-variables': 'variables',
};

const StorageDialog: React.FC<StorageDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('common');
  const {
    storageInfo,
    isLoading,
    clearLocalStorage,
    clearAllData,
    isWarning,
    isExceeded,
  } = useStorageStats();

  if (!isOpen) return null;

  const renderLocalStorageItem = (item: { key: string; bytes: number; mb: number }) => {
    const storedKey = Object.entries(STORAGE_KEY_LABELS).find(([k]) => k === item.key);
    const labelKey = storedKey ? storedKey[1] : item.key.replace('rpaforge-', '').replace(/-/g, ' ');
    const label = t(`common.storageInfo.${labelKey}`, { defaultValue: labelKey });
    return (
      <div
        key={item.key}
        className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
      >
        <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">{label}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {item.mb.toFixed(3)} MB
        </span>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FiDatabase className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('dialogs.storage')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <FiRefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">{t('dialogs.loading')}</div>
          ) : storageInfo ? (
            <>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('dialogs.storageUsage')}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      isExceeded
                        ? 'text-red-500'
                        : isWarning
                          ? 'text-yellow-500'
                          : 'text-green-500'
                    }`}
                  >
                    {storageInfo.localStorage.totalMB.toFixed(2)} MB
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isExceeded
                        ? 'bg-red-500'
                        : isWarning
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (storageInfo.localStorage.totalMB / 10) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  <span>0 MB</span>
                  <span>{t('dialogs.maxStorage')}</span>
                </div>
              </div>

              {isWarning && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${
                    isExceeded
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                  }`}
                >
                  <FiAlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">
                    {isExceeded
                      ? t('dialogs.storageLimitExceeded')
                      : t('dialogs.storageApproachingLimit')}
                  </span>
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t('dialogs.localStorageKeys')}
                  </span>
                </div>
                <div className="p-2 max-h-48 overflow-y-auto">
                  {storageInfo.localStorage.keys.length > 0 ? (
                    storageInfo.localStorage.keys.map(renderLocalStorageItem)
                  ) : (
                    <div className="text-center py-4 text-sm text-slate-500">
                      {t('dialogs.noDataStored')}
                    </div>
                  )}
                </div>
              </div>

              {storageInfo.indexedDB && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('dialogs.indexedDB')}
                    </span>
                    <span className="text-sm text-slate-500">
                      {formatBytes(storageInfo.indexedDB.estimateUsed)} {t('dialogs.used')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('dialogs.quota')}: {formatBytes(storageInfo.indexedDB.estimateQuota)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-red-500">{t('dialogs.failedToLoadStorage')}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <button
            onClick={clearLocalStorage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('dialogs.clearLocal')}
          </button>
          <button
            onClick={clearAllData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('dialogs.clearAll')}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-500 text-white hover:bg-indigo-600 rounded transition-colors"
          >
            <FiCheck className="w-4 h-4" />
            {t('dialogs.done')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageDialog;
