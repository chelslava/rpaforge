import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryInfo, CommunityLibrary } from '../../types/ipc-contracts';
import './LibraryCard.css';

interface LibraryCardProps {
  library: LibraryInfo | CommunityLibrary;
  onInstall?: () => Promise<void>;
  onUpdate?: () => Promise<void>;
  onUninstall?: () => Promise<void>;
  isInstalled: boolean;
}

export function LibraryCard({ library, onInstall, onUpdate, onUninstall, isInstalled }: LibraryCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const isInstalledLib = (lib: LibraryInfo | CommunityLibrary): lib is LibraryInfo => {
    return 'activitiesCount' in lib;
  };

  const isCommunityLib = (lib: LibraryInfo | CommunityLibrary): lib is CommunityLibrary => {
    return 'pypi_package' in lib && 'tags' in lib;
  };

  const handleInstall = async () => {
    if (!onInstall) return;
    try {
      setLoading(true);
      await onInstall();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!onUpdate) return;
    try {
      setLoading(true);
      await onUpdate();
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    if (!onUninstall) return;
    if (!confirm(t('libraries.confirmUninstall'))) return;
    try {
      setLoading(true);
      await onUninstall();
    } finally {
      setLoading(false);
    }
  };

  const name = isInstalledLib(library) ? library.name : library.display_name;
  const description = library.description || '';
  const version = library.version;
  const author = isInstalledLib(library) ? library.author : library.author;
  const tags = isCommunityLib(library) ? library.tags : [];

  return (
    <div className="library-card">
      <div className="library-card-header">
        <div className="library-card-title">
          <h3>{name}</h3>
          <span className="version">{version}</span>
        </div>
        <div className="library-card-actions">
          {isInstalled ? (
            isInstalledLib(library) && library.builtin ? (
              <span className="badge badge-builtin">{t('libraries.builtin')}</span>
            ) : (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={handleUpdate}
                  disabled={loading}
                >
                  {loading ? t('libraries.updating') : t('libraries.update')}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleUninstall}
                  disabled={loading}
                >
                  {loading ? t('libraries.uninstalling') : t('libraries.uninstall')}
                </button>
              </>
            )
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleInstall}
              disabled={loading}
            >
              {loading ? t('libraries.installing') : t('libraries.install')}
            </button>
          )}
        </div>
      </div>

      <p className="library-card-description">{description}</p>

      {author && <p className="library-card-author">{t('libraries.by')} {author}</p>}

      {tags.length > 0 && (
        <div className="library-card-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {isInstalledLib(library) && (
        <div className="library-card-stats">
          <span className="stat">
            {library.activitiesCount} {t('libraries.activities')}
          </span>
        </div>
      )}
    </div>
  );
}

export default LibraryCard;
