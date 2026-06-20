import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Spinner } from '../Common/Loading';

interface RemoteSettingsDialogProps {
  open: boolean;
  currentUrl: string | null;
  isSaving: boolean;
  onSave: (url: string) => void;
  onCancel: () => void;
}

const RemoteSettingsDialog: React.FC<RemoteSettingsDialogProps> = ({
  open,
  currentUrl,
  isSaving,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation('common');
  const [url, setUrl] = useState(currentUrl ?? '');
  const [prevOpen, setPrevOpen] = useState(open);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  // Re-seed the input from `currentUrl` each time the dialog transitions to
  // open, without resetting it on every keystroke while it stays open.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setUrl(currentUrl ?? '');
    }
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed || isSaving) return;
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-settings-dialog-title"
        className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-sm mx-4"
      >
        <h2
          id="remote-settings-dialog-title"
          className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2"
        >
          {t('gitSourceControl.remoteSettings')}
        </h2>
        {currentUrl === null && (
          <p className="text-xs text-ui-text-muted mb-2">
            {t('gitSourceControl.noRemoteConfigured')}
          </p>
        )}
        <label
          htmlFor="remote-settings-url-input"
          className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {t('gitSourceControl.remoteUrl')}
        </label>
        <input
          id="remote-settings-url-input"
          type="text"
          className="w-full mb-4 rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          placeholder={t('gitSourceControl.remoteUrlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!url.trim() || isSaving}
            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving && <Spinner size="sm" />}
            {t('gitSourceControl.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemoteSettingsDialog;
