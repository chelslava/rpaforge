import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { FiGitCommit } from 'react-icons/fi';
import { useGitStore } from '../../stores/gitStore';

const CommitHistoryView: React.FC = () => {
  const { t } = useTranslation('common');
  const { history, loadHistory } = useGitStore(
    useShallow((s) => ({
      history: s.history,
      loadHistory: s.loadHistory,
    }))
  );

  useEffect(() => {
    if (history.length === 0) {
      void loadHistory();
    }
  }, [history.length, loadHistory]);

  if (history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-ui-text-muted">{t('gitSourceControl.noChanges')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-1">
      {history.map((entry) => (
        <div
          key={entry.hash}
          className="flex items-start gap-2 px-3 py-2 border-b border-ui-border hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <FiGitCommit className="w-4 h-4 text-ui-text-muted flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ui-text truncate" title={entry.message}>
              {entry.message}
            </p>
            <p className="text-xs text-ui-text-muted truncate">
              <span className="font-mono">{entry.hash.slice(0, 7)}</span>
              {' · '}
              {entry.author_name}
              {' · '}
              {new Date(entry.date).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommitHistoryView;
