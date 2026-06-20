import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGitStore } from '../../stores/gitStore';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { Spinner } from '../Common/Loading';
import InitRepoPrompt from './InitRepoPrompt';
import ChangesView from './ChangesView';
import CommitHistoryView from './CommitHistoryView';

const SourceControlPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const projectPath = useProjectFsStore((s) => s.projectPath);
  const isRepo = useGitStore((s) => s.isRepo);
  const [subTab, setSubTab] = useState<'changes' | 'history'>('changes');

  useEffect(() => {
    if (!projectPath) return;
    void useGitStore.getState().refreshStatus();
    useGitStore.getState().startWatching();
    return () => {
      useGitStore.getState().stopWatching();
    };
  }, [projectPath]);

  if (isRepo === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="md" className="text-ui-text-muted" />
      </div>
    );
  }

  if (isRepo === false) {
    return <InitRepoPrompt />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex border-b border-ui-border flex-shrink-0">
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${subTab === 'changes' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
          onClick={() => setSubTab('changes')}
        >
          {t('gitSourceControl.changes')}
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${subTab === 'history' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
          onClick={() => setSubTab('history')}
        >
          {t('gitSourceControl.history')}
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {subTab === 'changes' ? <ChangesView /> : <CommitHistoryView />}
      </div>
    </div>
  );
};

export default SourceControlPanel;
