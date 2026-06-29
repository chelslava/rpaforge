import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryInfo, CommunityLibrary } from '../../types/ipc-contracts';
import LibraryCard from './LibraryCard';
import InstallProgress from './InstallProgress';
import './LibraryBrowser.css';

export function LibraryBrowser() {
  const { t } = useTranslation();
  const [installedLibraries, setInstalledLibraries] = useState<LibraryInfo[]>([]);
  const [communityLibraries, setCommunityLibraries] = useState<CommunityLibrary[]>([]);
  const [activeTab, setActiveTab] = useState<'installed' | 'community'>('installed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<{ libraryName: string; progress: number; status: 'idle' | 'installing' | 'success' | 'error'; errorMessage?: string }>({
    libraryName: '',
    progress: 0,
    status: 'idle',
  });
  const [showProgress, setShowProgress] = useState(false);

  const loadLibraries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load installed libraries
      const installed = await window.rpaforge?.libraries.listInstalled();
      setInstalledLibraries(installed || []);

      // Load community libraries
      const registry = await window.rpaforge?.libraries.getRegistry();
      setCommunityLibraries(registry?.libraries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load libraries');
      console.error('Failed to load libraries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLibraries();
  }, [loadLibraries]);

  useEffect(() => {
    const unsubscribe = window.rpaforge?.libraries.onInstallProgress((progress: { percent: number; status: string; message?: string }) => {
      if (progress.status === 'success') {
        setInstallProgress(prev => ({ ...prev, progress: 100, status: 'success' }));
      } else if (progress.status === 'error') {
        setInstallProgress(prev => ({ ...prev, status: 'error', errorMessage: progress.message }));
      } else {
        setInstallProgress(prev => ({ ...prev, progress: progress.percent }));
      }
    });
    return () => unsubscribe?.();
  }, []);

  const handleInstall = async (pypiPackage: string) => {
    try {
      const libraryName = communityLibraries.find(lib => lib.pypi_package === pypiPackage)?.display_name || pypiPackage;
      setInstallProgress({ libraryName, progress: 0, status: 'installing' });
      setShowProgress(true);

      const result = await window.rpaforge?.libraries.install(pypiPackage);
      if (result?.success) {
        setInstallProgress(prev => ({ ...prev, progress: 100, status: 'success' }));
        // Refresh libraries on bridge and reload UI after successful installation
        setTimeout(async () => {
          try {
            await window.rpaforge?.libraries.refreshLibraries();
            await loadLibraries();
          } catch (e) {
            console.error('Failed to refresh libraries:', e);
            await loadLibraries();
          }
        }, 1500);
      } else {
        setInstallProgress(prev => ({ ...prev, status: 'error', errorMessage: result?.message }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Installation failed';
      setInstallProgress(prev => ({ ...prev, status: 'error', errorMessage: errorMsg }));
      console.error('Failed to install library:', err);
    }
  };

  const handleUninstall = async (pypiPackage: string) => {
    try {
      const result = await window.rpaforge?.libraries.uninstall(pypiPackage);
      if (result?.success) {
        // Reload libraries after successful uninstall
        await loadLibraries();
      } else {
        setError(result?.message || 'Uninstall failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstall failed');
      console.error('Failed to uninstall library:', err);
    }
  };

  if (loading) {
    return (
      <div className="library-browser loading">
        <div className="spinner" />
        <p>{t('libraries.loading')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="library-browser">
        <div className="library-browser-header">
          <h2>{t('libraries.title')}</h2>
        <div className="library-browser-tabs">
          <button
            className={`tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            {t('libraries.installed')} ({installedLibraries.length})
          </button>
          <button
            className={`tab ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            {t('libraries.community')} ({communityLibraries.length})
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="library-browser-content">
        {activeTab === 'installed' ? (
          <div className="libraries-list">
            {installedLibraries.length === 0 ? (
              <p className="empty-state">{t('libraries.noInstalled')}</p>
            ) : (
              installedLibraries.map((lib) => (
                <LibraryCard
                  key={lib.name}
                  library={lib}
                  onUninstall={() => handleUninstall(lib.name)}
                  isInstalled={true}
                />
              ))
            )}
          </div>
        ) : (
          <div className="libraries-list">
            {communityLibraries.length === 0 ? (
              <p className="empty-state">{t('libraries.noCommunity')}</p>
            ) : (
              communityLibraries.map((lib) => (
                <LibraryCard
                  key={lib.pypi_package}
                  library={lib}
                  onInstall={() => handleInstall(lib.pypi_package)}
                  isInstalled={installedLibraries.some(
                    (installed) => installed.name === lib.name
                  )}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>

      <InstallProgress
        isOpen={showProgress}
        libraryName={installProgress.libraryName}
        isInstalling={installProgress.status === 'installing'}
        progress={installProgress.progress}
        status={installProgress.status}
        errorMessage={installProgress.errorMessage}
        onClose={() => setShowProgress(false)}
      />
    </>
  );
}

export default LibraryBrowser;
