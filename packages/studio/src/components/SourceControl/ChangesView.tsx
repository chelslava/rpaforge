import React, { lazy, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { useGitStore } from '../../stores/gitStore';
import { Spinner } from '../Common/Loading';
import ConfirmDialog from '../Common/ConfirmDialog';
import FileStatusRow from './FileStatusRow';
import { LazyFeature } from '../Common/LazyFeature';

const DiffViewer = lazy(() => import('./DiffViewer'));

const ChangesView: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    ahead,
    behind,
    staged,
    unstaged,
    conflicted,
    commitMessage,
    isPushing,
    isPulling,
    isCommitting,
    setCommitMessage,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    commit,
    push,
    pull,
    loadDiff,
    setSelectedDiffFile,
    discardChanges,
  } = useGitStore(
    useShallow((s) => ({
      ahead: s.ahead,
      behind: s.behind,
      staged: s.staged,
      unstaged: s.unstaged,
      conflicted: s.conflicted,
      commitMessage: s.commitMessage,
      isPushing: s.isPushing,
      isPulling: s.isPulling,
      isCommitting: s.isCommitting,
      setCommitMessage: s.setCommitMessage,
      stageFiles: s.stageFiles,
      unstageFiles: s.unstageFiles,
      stageAll: s.stageAll,
      unstageAll: s.unstageAll,
      commit: s.commit,
      push: s.push,
      pull: s.pull,
      loadDiff: s.loadDiff,
      setSelectedDiffFile: s.setSelectedDiffFile,
      discardChanges: s.discardChanges,
    }))
  );

  const [diffTarget, setDiffTarget] = useState<{ path: string; staged: boolean } | null>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  const handleViewDiff = (path: string, isStaged: boolean) => {
    void loadDiff(path, isStaged);
    setSelectedDiffFile(path);
    setDiffTarget({ path, staged: isStaged });
  };

  const handleCloseDiff = () => {
    setDiffTarget(null);
    setSelectedDiffFile(null);
  };

  const handlePush = async () => {
    await push();
    const { error } = useGitStore.getState();
    if (error) {
      toast.error(t('gitSourceControl.error', { message: error }));
    } else {
      toast.success(t('gitSourceControl.pushSuccess'));
    }
  };

  const handlePull = async () => {
    await pull();
    const { error } = useGitStore.getState();
    if (error) {
      toast.error(t('gitSourceControl.error', { message: error }));
    } else {
      toast.success(t('gitSourceControl.pullSuccess'));
    }
  };

  const handleCommit = async () => {
    if (staged.length === 0 || !commitMessage.trim() || isCommitting) return;
    await commit();
    const { error } = useGitStore.getState();
    if (error) {
      toast.error(t('gitSourceControl.error', { message: error }));
    } else {
      toast.success(t('gitSourceControl.commitSuccess'));
    }
  };

  const handleConfirmDiscard = async () => {
    if (!discardTarget) return;
    const path = discardTarget;
    setDiscardTarget(null);
    await discardChanges([path]);
    const { error } = useGitStore.getState();
    if (error) {
      toast.error(t('gitSourceControl.error', { message: error }));
    }
  };

  const isEmpty = staged.length === 0 && unstaged.length === 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-2 border-b border-ui-border flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          {(ahead > 0 || behind > 0) && (
            <div className="flex items-center gap-2 text-xs text-ui-text-muted">
              {ahead > 0 && (
                <span className="flex items-center gap-0.5">
                  <FiArrowUp className="w-3 h-3" />
                  {ahead}
                </span>
              )}
              {behind > 0 && (
                <span className="flex items-center gap-0.5">
                  <FiArrowDown className="w-3 h-3" />
                  {behind}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handlePull}
              disabled={isPulling}
              className="px-2 py-1 text-xs bg-ui-secondary text-ui-text-inverse rounded hover:bg-ui-secondary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPulling && <Spinner size="sm" />}
              {t('gitSourceControl.pull')}
            </button>
            <button
              onClick={handlePush}
              disabled={isPushing}
              className="px-2 py-1 text-xs bg-ui-secondary text-ui-text-inverse rounded hover:bg-ui-secondary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPushing && <Spinner size="sm" />}
              {t('gitSourceControl.push')}
            </button>
          </div>
        </div>

        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleCommit();
            }
          }}
          placeholder={t('gitSourceControl.commitPlaceholder')}
          rows={2}
          className="w-full px-2 py-1.5 text-sm bg-ui-surface border border-ui-border rounded resize-none text-ui-text placeholder:text-ui-text-muted focus:outline-none focus:border-ui-primary"
        />

        <button
          onClick={handleCommit}
          disabled={staged.length === 0 || !commitMessage.trim() || isCommitting}
          className="w-full px-3 py-1.5 text-sm bg-ui-primary hover:bg-ui-primary-hover text-ui-text-inverse rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCommitting && <Spinner size="sm" />}
          {t('gitSourceControl.commit')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty && conflicted.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-sm text-ui-text-muted">{t('gitSourceControl.noChanges')}</p>
          </div>
        ) : (
          <>
            {conflicted.length > 0 && (
              <div className="px-3 py-2 border-b border-ui-border">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                  {t('gitSourceControl.mergeConflict')}
                </p>
                {conflicted.map((path) => (
                  <p key={path} className="text-sm text-ui-text truncate" title={path}>
                    {path}
                  </p>
                ))}
              </div>
            )}

            {staged.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 sticky top-0 bg-ui-surface-raised">
                  <span className="text-xs font-medium text-ui-text-muted uppercase">
                    {t('gitSourceControl.stagedChanges')}
                  </span>
                  <button
                    onClick={() => unstageAll()}
                    className="text-xs text-ui-primary hover:underline"
                  >
                    {t('gitSourceControl.unstageAll')}
                  </button>
                </div>
                {staged.map((file) => (
                  <FileStatusRow
                    key={`staged:${file.path}`}
                    file={file}
                    onUnstage={() => unstageFiles([file.path])}
                    onViewDiff={() => handleViewDiff(file.path, true)}
                  />
                ))}
              </div>
            )}

            {unstaged.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-1 sticky top-0 bg-ui-surface-raised">
                  <span className="text-xs font-medium text-ui-text-muted uppercase">
                    {t('gitSourceControl.changes')}
                  </span>
                  <button
                    onClick={() => stageAll()}
                    className="text-xs text-ui-primary hover:underline"
                  >
                    {t('gitSourceControl.stageAll')}
                  </button>
                </div>
                {unstaged.map((file) => (
                  <FileStatusRow
                    key={`unstaged:${file.path}`}
                    file={file}
                    onStage={() => stageFiles([file.path])}
                    onViewDiff={() => handleViewDiff(file.path, false)}
                    onDiscard={() => setDiscardTarget(file.path)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {diffTarget && (
        <LazyFeature>
          <DiffViewer
            filePath={diffTarget.path}
            staged={diffTarget.staged}
            onClose={handleCloseDiff}
          />
        </LazyFeature>
      )}

      <ConfirmDialog
        open={discardTarget !== null}
        title={t('gitSourceControl.discardConfirmTitle')}
        message={t('gitSourceControl.discardConfirmMessage', {
          file: discardTarget ?? '',
        })}
        confirmLabel={t('gitSourceControl.discardChanges')}
        destructive
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardTarget(null)}
      />
    </div>
  );
};

export default ChangesView;
