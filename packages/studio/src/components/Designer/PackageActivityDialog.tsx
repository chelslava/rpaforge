import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { useEngine } from '../../hooks/useEngine';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DiagramRef {
  id: string;
  name: string;
  path: string;
}

interface PackageActivityDialogProps {
  diagram: DiagramRef;
  onClose: () => void;
}

/**
 * Sub-diagram → installable activity packaging dialog (issue #851).
 * Reads the diagram file, calls the core packager via the bridge, and
 * writes the generated project under `<project>/custom-activities/`.
 */
const PackageActivityDialog: React.FC<PackageActivityDialogProps> = ({ diagram, onClose }) => {
  const { t } = useTranslation('common');
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const [libraryName, setLibraryName] = useState(diagram.name);
  const [activityName, setActivityName] = useState(`Run ${diagram.name}`);
  const [description, setDescription] = useState(
    `Custom activity packaging the "${diagram.name}" sub-diagram`
  );
  const [isWorking, setIsWorking] = useState(false);
  const readFile = useProjectFsStore((s) => s.readFile);
  const projectPath = useProjectFsStore((s) => s.projectPath);
  const { packageActivity } = useEngine();

  const handleConfirm = async () => {
    setIsWorking(true);
    try {
      const raw = await readFile(diagram.path);
      const doc = JSON.parse(raw) as Record<string, unknown>;
      const outDir = projectPath ? `${projectPath}/custom-activities` : undefined;
      const result = await packageActivity({
        diagram: doc,
        libraryName: libraryName.trim(),
        activityName: activityName.trim(),
        description: description.trim(),
        outDir,
      });
      toast.success(t('designer.packageActivity.success', { path: result.path }));
      onClose();
    } catch (err) {
      toast.error(
        t('designer.packageActivity.failed', {
          message: err instanceof Error ? err.message : String(err),
        })
      );
      setIsWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ui-overlay" onClick={onClose} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('designer.packageActivity.title')}
        className="relative rounded-lg bg-ui-surface p-4 shadow-xl w-full max-w-md mx-4"
      >
        <h2 className="text-sm font-semibold text-ui-text mb-2">
          {t('designer.packageActivity.title')}
        </h2>
        <p className="text-xs text-ui-text-muted mb-3">
          {t('designer.packageActivity.subtitle', { name: diagram.name })}
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-ui-text-muted" htmlFor="pkg-lib-name">
            {t('designer.packageActivity.libraryName')}
          </label>
          <input
            id="pkg-lib-name"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            className="w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-sm text-ui-text"
          />
          <label className="block text-xs text-ui-text-muted" htmlFor="pkg-act-name">
            {t('designer.packageActivity.activityName')}
          </label>
          <input
            id="pkg-act-name"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            className="w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-sm text-ui-text"
          />
          <label className="block text-xs text-ui-text-muted" htmlFor="pkg-desc">
            {t('designer.packageActivity.description')}
          </label>
          <input
            id="pkg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-sm text-ui-text"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm text-ui-text-muted hover:text-ui-text">
            {t('actions.cancel')}
          </button>
          <button
            disabled={isWorking || !libraryName.trim() || !activityName.trim()}
            onClick={() => void handleConfirm()}
            className="rounded bg-ui-primary px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t('designer.packageActivity.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageActivityDialog;
