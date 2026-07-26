import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMousePointer, FiType, FiList, FiNavigation, FiKey, FiTrash2, FiDownload, FiActivity } from 'react-icons/fi';
import EmptyState from '../Common/EmptyState';
import type { RecordedAction, CandidateSelector } from './SelectorInference';

interface ActionListProps {
  actions: RecordedAction[];
  onUpdate: (id: string, selector: CandidateSelector) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onApply: () => void;
  onEnhance: () => void;
  onApplyEnhancement: () => void;
  isEnhancing: boolean;
  hasEnhancement: boolean;
}

const actionIcon: Record<RecordedAction['type'], React.ReactNode> = {
  click: <FiMousePointer className="w-3.5 h-3.5" />,
  input: <FiType className="w-3.5 h-3.5" />,
  select: <FiList className="w-3.5 h-3.5" />,
  navigate: <FiNavigation className="w-3.5 h-3.5" />,
  keypress: <FiKey className="w-3.5 h-3.5" />,
};

const ActionRow: React.FC<{
  action: RecordedAction;
  onUpdate: (id: string, selector: CandidateSelector) => void;
  onDelete: (id: string) => void;
}> = ({ action, onUpdate, onDelete }) => {
  const { t } = useTranslation('common');
  const handleSelectorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const found = action.allCandidates.find((c) => c.value === e.target.value);
      if (found) onUpdate(action.id, found);
    },
    [action, onUpdate],
  );
  const actionTypeLabel = t(`recorder.actionTypes.${action.type}`);

  return (
    <div className="flex items-start gap-2 px-2 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs">
      <span className="flex-shrink-0 mt-0.5 text-slate-500 dark:text-slate-400" title={actionTypeLabel}>
        {actionIcon[action.type]}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">{actionTypeLabel}</span>
          {action.value && (
            <span className="text-slate-400 dark:text-slate-500 truncate font-mono">
              = "{action.value.slice(0, 20)}"
            </span>
          )}
        </div>

        {action.allCandidates.length > 1 ? (
          <select
            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={action.selector.value}
            onChange={handleSelectorChange}
          >
            {action.allCandidates.map((c) => (
              <option key={c.value} value={c.value}>
                [{c.type}] {c.value}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-slate-600 dark:text-slate-300 truncate">
            {action.selector.value}
          </span>
        )}
      </div>

      <button
            className="flex-shrink-0 p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
        onClick={() => onDelete(action.id)}
        title={t('actionList.deleteAction')}
        aria-label={t('actionList.deleteAction')}
      >
        <FiTrash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const ActionList: React.FC<ActionListProps> = ({
  actions,
  onUpdate,
  onDelete,
  onExport,
  onApply,
  onEnhance,
  onApplyEnhancement,
  isEnhancing,
  hasEnhancement,
}) => {
  const { t } = useTranslation('common');
  if (actions.length === 0) {
    return (
      <EmptyState
        icon={<FiActivity className="w-8 h-8" />}
        title={t('actionList.noActions')}
        description={t('actionList.startRecording')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {t('actionList.actions')}
        </span>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
          onClick={onExport}
          title={t('recorder.export')}
        >
          <FiDownload className="w-3 h-3" />
          {t('recorder.export')}
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 transition-colors"
          onClick={onApply}
          title={t('recorder.apply')}
        >
          {t('recorder.apply')}
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-300 transition-colors disabled:opacity-50"
          onClick={onEnhance}
          disabled={isEnhancing}
          title={t('recorder.enhance')}
        >
          {isEnhancing ? t('recorder.enhancing') : t('recorder.enhance')}
        </button>
        {hasEnhancement && (
          <button
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            onClick={onApplyEnhancement}
          >
            {t('recorder.applyEnhancement')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {actions.map((action) => (
          <ActionRow key={action.id} action={action} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
};

export default ActionList;
