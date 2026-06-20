import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiGitBranch } from 'react-icons/fi';
import { useGitStore } from '../../stores/gitStore';

const InitRepoPrompt: React.FC = () => {
  const { t } = useTranslation('common');

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 text-center">
      <FiGitBranch className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
      <p className="text-sm text-ui-text-muted mb-3">{t('gitSourceControl.notARepo')}</p>
      <button
        onClick={() => useGitStore.getState().initRepo()}
        className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
      >
        {t('gitSourceControl.initRepo')}
      </button>
    </div>
  );
};

export default InitRepoPrompt;
