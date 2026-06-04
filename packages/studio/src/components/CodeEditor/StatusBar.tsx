import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiAlertTriangle } from 'react-icons/fi';

interface StatusBarProps {
  line: number;
  column: number;
  encoding?: string;
  language?: string;
  isSaved?: boolean;
  errors?: number;
  warnings?: number;
  onNextProblem?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  line,
  column,
  encoding = 'UTF-8',
  language = 'Python',
  isSaved = true,
  errors = 0,
  warnings = 0,
  onNextProblem,
}) => {
  const { t } = useTranslation('common');
  const ProblemCounts = (
    <div className="flex items-center gap-3">
      {errors > 0 && (
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <FiAlertCircle className="w-3 h-3" />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <FiAlertTriangle className="w-3 h-3" />
          {warnings}
        </span>
      )}
    </div>
  );
  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-4">
        <span>
          Ln {line}, Col {column}
        </span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span>{encoding}</span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span>{language}</span>
        {(errors > 0 || warnings > 0) && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            {onNextProblem ? (
              <button
                type="button"
                onClick={onNextProblem}
                title={t('codeEditor.editor.nextProblem')}
                className="flex items-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 px-1 -mx-1 transition-colors"
              >
                {ProblemCounts}
              </button>
            ) : (
              ProblemCounts
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1 ${
            isSaved ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isSaved ? 'bg-green-500' : 'bg-amber-500'
            }`}
          />
          {isSaved ? t('codeEditor.editor.saved') : t('codeEditor.editor.modified')}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
