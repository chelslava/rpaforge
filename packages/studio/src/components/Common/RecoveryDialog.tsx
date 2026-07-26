import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { AutoSaveBackup } from '../../hooks/useAutoSave';

interface RecoveryDialogProps {
  backup: AutoSaveBackup | null;
  error: string | null;
  onRestore: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({
  backup,
  error,
  onRestore,
  onDiscard,
  onClose,
}) => {
  const { t } = useTranslation('common');
  const [showDetails, setShowDetails] = useState(false);
  const open = backup !== null || error !== null;
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const title = error
    ? t('recovery.invalidTitle', 'Autosave recovery unavailable')
    : t('recovery.title', 'Recover unsaved work?');
  const message = error
    ?? t('recovery.message', 'RPAForge found a valid autosave from an earlier session.');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
        className="relative bg-ui-surface rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <h2 id="recovery-dialog-title" className="text-lg font-semibold text-ui-text mb-2">
          {title}
        </h2>
        <p className="text-sm text-ui-text-muted mb-4">{message}</p>

        {backup && (
          <div className="rounded border border-ui-border bg-ui-surface-raised p-3 mb-4 text-sm text-ui-text">
            <div className="font-medium">{backup.metadata.name}</div>
            <div className="text-ui-text-muted">
              {t('recovery.nodes', '{{count}} nodes', { count: backup.nodes.length })}
              {' · '}
              {backup.timestamp ? new Date(backup.timestamp).toLocaleString() : ''}
            </div>
            {showDetails && (
              <pre className="mt-3 max-h-32 overflow-auto text-xs whitespace-pre-wrap">
                {JSON.stringify({ metadata: backup.metadata, variables: backup.variables }, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {backup && (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded border border-ui-border text-ui-text hover:bg-ui-surface-hover"
              onClick={() => setShowDetails((visible) => !visible)}
            >
              {showDetails
                ? t('recovery.hideDetails', 'Hide details')
                : t('recovery.inspect', 'Inspect')}
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded border border-ui-border text-ui-text hover:bg-ui-surface-hover"
            onClick={onDiscard}
          >
            {t('recovery.discard', 'Discard')}
          </button>
          {backup && (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded bg-ui-primary text-white hover:bg-ui-primary-hover"
              onClick={onRestore}
            >
              {t('recovery.restore', 'Restore')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecoveryDialog;
