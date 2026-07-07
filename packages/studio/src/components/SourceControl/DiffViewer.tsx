import React, { useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { useGitStore } from '../../stores/gitStore';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DiffViewerProps {
  filePath: string;
  staged: boolean;
  onClose: () => void;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ filePath, staged, onClose }) => {
  const { t } = useTranslation('common');
  const resolvedTheme = useResolvedTheme();
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const diff = useGitStore((s) => s.diffCache[`${filePath}:${staged}`]);
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ui-overlay" onClick={onClose} />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('gitSourceControl.viewDiff')}
        className="relative bg-ui-surface dark:bg-ui-surface rounded-lg shadow-xl w-full max-w-4xl h-[80vh] mx-4 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ui-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-ui-text truncate" title={filePath}>
            {basename(filePath)} — {t('gitSourceControl.viewDiff')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-ui-text-muted hover:text-ui-text rounded"
            aria-label={t('actions.cancel')}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <Editor
            value={diff ?? ''}
            language="diff"
            theme={editorTheme}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;
