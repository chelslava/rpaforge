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

   // Check if library has SHA-256 verification (verified badge)
   const hasSha256 = isCommunityLib(library) && !!library.sha256 && library.sha256.trim() !== '';
   const sha256Empty = isCommunityLib(library) && library.sha256 && library.sha256.trim() === '';

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

       {hasSha256 && (
         <span className="badge badge-verified" title="Verified package">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M22 9v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9" />
             <path d="M22 9l-4-4" />
             <path d="M18 5l-6 6" />
             <path d="M4 9l6 6" />
           </svg>
           {t('libraries.verified')}
         </span>
       )}
       {sha256Empty && isCommunityLib(library) && (
         <span className="badge badge-unverified" title="Verify SHA-256 hash">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
             <path d="M7 11V7a5 5 0 0 1 10 0v4" />
           </svg>
           {t('libraries.unverified')}
         </span>
       )}

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
