import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FiSettings } from 'react-icons/fi';
import { useGitStore } from '../../stores/gitStore';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { Spinner } from '../Common/Loading';
import InitRepoPrompt from './InitRepoPrompt';
import ChangesView from './ChangesView';
import CommitHistoryView from './CommitHistoryView';
import RemoteSettingsDialog from './RemoteSettingsDialog';

const SourceControlPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const projectPath = useProjectFsStore((s) => s.projectPath);
  const isRepo = useGitStore((s) => s.isRepo);
  const remoteUrl = useGitStore((s) => s.remoteUrl);
  const isSavingRemote = useGitStore((s) => s.isSavingRemote);
  const [subTab, setSubTab] = useState<'changes' | 'history'>('changes');
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  useEffect(() => {
    if (!projectPath) return;
    void useGitStore.getState().refreshStatus();
    void useGitStore.getState().loadRemoteUrl();
    useGitStore.getState().startWatching();
    return () => {
      useGitStore.getState().stopWatching();
    };
  }, [projectPath]);

  const handleSaveRemote = async (url: string) => {
    await useGitStore.getState().setRemoteUrl(url);
    const { error } = useGitStore.getState();
    if (error) {
      toast.error(t('gitSourceControl.error', { message: error }));
    } else {
      setRemoteDialogOpen(false);
      toast.success(t('gitSourceControl.remoteUrlSaved'));
    }
  };

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
        <button
          className="px-2 text-ui-text-muted hover:text-ui-text"
          onClick={() => setRemoteDialogOpen(true)}
          title={t('gitSourceControl.remoteSettings')}
          aria-label={t('gitSourceControl.remoteSettings')}
        >
          <FiSettings className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {subTab === 'changes' ? <ChangesView /> : <CommitHistoryView />}
      </div>

      <RemoteSettingsDialog
        open={remoteDialogOpen}
        currentUrl={remoteUrl}
        isSaving={isSavingRemote}
        onSave={handleSaveRemote}
        onCancel={() => setRemoteDialogOpen(false)}
      />
    </div>
  );
};

export default SourceControlPanel;
