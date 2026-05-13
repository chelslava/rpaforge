import React from 'react';
import { FiRepeat } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

interface RetryScopeBlockEditorProps {
  blockData: {
    retryCount?: number;
    retryInterval?: string;
    condition?: string;
  };
  onUpdateBlockData: (updates: Partial<{
    retryCount: number;
    retryInterval: string;
    condition: string;
  }>) => void;
}

const RetryScopeBlockEditor: React.FC<RetryScopeBlockEditorProps> = ({
  blockData,
  onUpdateBlockData,
}) => {
  const { t } = useTranslation('blocks');
  const retryCount = blockData.retryCount ?? 3;
  const retryInterval = blockData.retryInterval ?? '5s';
  const condition = blockData.condition ?? '';

  const INTERVAL_OPTIONS = [
    { value: '1s', label: t('propertyEditors.retryScope.summary') },
    { value: '2s', label: t('propertyEditors.retryScope.attempts') },
    { value: '5s', label: t('propertyEditors.retryScope.interval') },
    { value: '10s', label: t('propertyEditors.retryScope.stopCondition') },
    { value: '30s', label: t('propertyEditors.retryScope.summary') },
    { value: '1m', label: t('propertyEditors.retryScope.summary') },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <FiRepeat className="h-4 w-4" />
          <span className="text-sm font-medium">{t('propertyEditors.retryScope.title')}</span>
        </div>
        <p className="mt-1 text-xs text-amber-500 dark:text-amber-300">
          {t('propertyEditors.retryScope.description')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.retryScope.attempts')}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={retryCount}
          onChange={(e) => onUpdateBlockData({ retryCount: parseInt(e.target.value, 10) || 0 })}
        />
        <p className="mt-1 text-xs text-slate-500">
          {t('propertyEditors.retryScope.attemptsHint')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.retryScope.interval')}
        </label>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={retryInterval}
          onChange={(e) => onUpdateBlockData({ retryInterval: e.target.value })}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {t('propertyEditors.retryScope.intervalHint')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.retryScope.stopCondition')}
        </label>
           <input
              type="text"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
              value={condition}
              onChange={(e) => onUpdateBlockData({ condition: e.target.value })}
              placeholder={t('retryScope.stopConditionPlaceholder', { defaultValue: "e.g., ${result} == 'success'" })}
            />
         <p className="mt-1 text-xs text-slate-500">
           {t('propertyEditors.retryScope.stopConditionHint')}
         </p>
       </div>

       <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
         <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
           {t('propertyEditors.retryScope.summary')}
         </div>
         <div className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
           <div>{t('propertyEditors.retryScope.attemptsLabel', { attempts: retryCount + 1, retries: retryCount })}</div>
            <div>{t('propertyEditors.retryScope.intervalLabel')}: {INTERVAL_OPTIONS.find(o => o.value === retryInterval)?.label}</div>
           {condition && <div>{t('propertyEditors.retryScope.conditionLabel', { condition })}</div>}
         </div>
      </div>
    </div>
  );
};

export default RetryScopeBlockEditor;
