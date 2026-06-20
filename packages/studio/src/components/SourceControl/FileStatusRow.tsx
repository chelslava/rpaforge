import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiMinus, FiRotateCcw } from 'react-icons/fi';
import type { GitFileStatus } from '../../types/git';

interface FileStatusRowProps {
  file: GitFileStatus;
  onStage?: () => void;
  onUnstage?: () => void;
  onViewDiff: () => void;
  onDiscard?: () => void;
}

function statusChar(file: GitFileStatus): string {
  const index = file.index.trim();
  const working = file.working_dir.trim();
  return index || working || '?';
}

function badgeClasses(char: string): string {
  switch (char) {
    case 'M':
      return 'text-amber-600 dark:text-amber-400';
    case 'A':
      return 'text-green-600 dark:text-green-400';
    case 'D':
      return 'text-red-600 dark:text-red-400';
    case '?':
      return 'text-blue-500 dark:text-blue-400';
    default:
      return 'text-ui-text-muted';
  }
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

const FileStatusRow: React.FC<FileStatusRowProps> = ({
  file,
  onStage,
  onUnstage,
  onViewDiff,
  onDiscard,
}) => {
  const { t } = useTranslation('common');
  const char = statusChar(file);
  const name = basename(file.path);

  return (
    <div
      className="group flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
      onClick={onViewDiff}
      title={file.path}
    >
      <span className="truncate flex-1 text-ui-text" title={file.path}>
        {name}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        {onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            className="p-0.5 text-ui-text-muted hover:text-red-600 dark:hover:text-red-400 rounded"
            aria-label={t('gitSourceControl.discardChanges')}
            title={t('gitSourceControl.discardChanges')}
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {onStage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStage();
            }}
            className="p-0.5 text-ui-text-muted hover:text-ui-primary rounded"
            aria-label={t('gitSourceControl.stageAll')}
          >
            <FiPlus className="w-3.5 h-3.5" />
          </button>
        )}
        {onUnstage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnstage();
            }}
            className="p-0.5 text-ui-text-muted hover:text-ui-primary rounded"
            aria-label={t('gitSourceControl.unstageAll')}
          >
            <FiMinus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <span className={`w-4 text-center font-mono font-semibold flex-shrink-0 ${badgeClasses(char)}`}>
        {char}
      </span>
    </div>
  );
};

export default FileStatusRow;
