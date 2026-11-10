import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiArrowDown,
  FiArrowUp,
  FiCheckSquare,
  FiDownload,
  FiEye,
  FiEyeOff,
  FiKey,
  FiList,
  FiMousePointer,
  FiNavigation,
  FiShield,
  FiSquare,
  FiTrash2,
  FiType,
  FiActivity,
} from 'react-icons/fi';
import EmptyState from '../Common/EmptyState';
import type { RecordedAction, CandidateSelector } from './SelectorInference';

interface ActionListProps {
  actions: RecordedAction[];
  onUpdate: (id: string, selector: CandidateSelector) => void;
  onUpdateValue: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onToggleInclude: (id: string) => void;
  onToggleWrap: (ids: string[]) => void;
  onMove: (id: string, direction: -1 | 1) => void;
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

const EDITABLE_TYPES: ReadonlySet<RecordedAction['type']> = new Set([
  'input',
  'select',
  'keypress',
]);

const ActionRow: React.FC<{
  action: RecordedAction;
  index: number;
  total: number;
  selected: boolean;
  onUpdate: (id: string, selector: CandidateSelector) => void;
  onUpdateValue: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onToggleInclude: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}> = ({
  action,
  index,
  total,
  selected,
  onUpdate,
  onUpdateValue,
  onDelete,
  onToggleInclude,
  onToggleSelect,
  onMove,
}) => {
  const { t } = useTranslation('common');
  const handleSelectorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const found = action.allCandidates.find((c) => c.value === e.target.value);
      if (found) onUpdate(action.id, found);
    },
    [action, onUpdate],
  );
  const actionTypeLabel = t(`recorder.actionTypes.${action.type}`);
  const excluded = action.included === false;

  return (
    <div
      className={`flex items-start gap-2 px-2 py-2 rounded-md border text-xs transition-opacity ${
        excluded
          ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 opacity-60'
          : selected
            ? 'border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-800/60'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleSelect(action.id)}
        className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400"
        title={t('actionList.toggleWrapSelection')}
        aria-pressed={selected}
        aria-label={t('actionList.toggleWrapSelection')}
      >
        {selected ? (
          <FiCheckSquare className="w-3.5 h-3.5 text-indigo-500" />
        ) : (
          <FiSquare className="w-3.5 h-3.5" />
        )}
      </button>

      <span
        className={`flex-shrink-0 mt-0.5 ${excluded ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}
        title={actionTypeLabel}
      >
        {actionIcon[action.type]}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-medium ${excluded ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
            {actionTypeLabel}
          </span>
          {action.wrapIn === 'try-catch' && (
            <span
              className="flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title={t('actionList.wrappedInTryCatch')}
            >
              <FiShield className="w-2.5 h-2.5" />
              {t('actionList.wrappedInTryCatch')}
            </span>
          )}
        </div>

        {EDITABLE_TYPES.has(action.type) ? (
          <input
            value={action.value ?? ''}
            onChange={(e) => onUpdateValue(action.id, e.target.value)}
            placeholder={t('actionList.valuePlaceholder')}
            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label={t('actionList.editValue')}
          />
        ) : action.value ? (
          <span className="text-slate-400 dark:text-slate-500 truncate font-mono">
            = "{action.value.slice(0, 20)}"
          </span>
        ) : null}

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

      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(action.id, -1)}
          className="p-0.5 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-500 disabled:opacity-30"
          title={t('actionList.moveUp')}
          aria-label={t('actionList.moveUp')}
        >
          <FiArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(action.id, 1)}
          className="p-0.5 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-500 disabled:opacity-30"
          title={t('actionList.moveDown')}
          aria-label={t('actionList.moveDown')}
        >
          <FiArrowDown className="w-3 h-3" />
        </button>
      </div>

      <button
        type="button"
        className="flex-shrink-0 p-1 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-500 transition-colors"
        onClick={() => onToggleInclude(action.id)}
        title={excluded ? t('actionList.includeAction') : t('actionList.excludeAction')}
        aria-label={excluded ? t('actionList.includeAction') : t('actionList.excludeAction')}
        aria-pressed={!excluded}
      >
        {excluded ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
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
  onUpdateValue,
  onDelete,
  onToggleInclude,
  onToggleWrap,
  onMove,
  onExport,
  onApply,
  onEnhance,
  onApplyEnhancement,
  isEnhancing,
  hasEnhancement,
}) => {
  const { t } = useTranslation('common');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (actions.length === 0) {
    return (
      <EmptyState
        icon={<FiActivity className="w-8 h-8" />}
        title={t('actionList.noActions')}
        description={t('actionList.startRecording')}
      />
    );
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const wrapSelected = () => {
    onToggleWrap(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {t('actionList.actions')}
        </span>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-300 transition-colors disabled:opacity-40"
          onClick={wrapSelected}
          disabled={selectedIds.size === 0}
          title={t('actionList.wrapInTryCatch')}
        >
          <FiShield className="w-3 h-3" />
          {t('actionList.wrapInTryCatch')}
          {selectedIds.size > 0 && ` (${selectedIds.size})`}
        </button>
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
        {actions.map((action, index) => (
          <ActionRow
            key={action.id}
            action={action}
            index={index}
            total={actions.length}
            selected={selectedIds.has(action.id)}
            onUpdate={onUpdate}
            onUpdateValue={onUpdateValue}
            onDelete={onDelete}
            onToggleInclude={onToggleInclude}
            onToggleSelect={toggleSelection}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
};

export default ActionList;
