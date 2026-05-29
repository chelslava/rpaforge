import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGrid } from 'react-icons/fi';

import VariablePicker from '../../VariablePicker';
import ActivityParamEditor, { type VariableOption } from './ActivityParamEditor';
import type { Activity } from '../../../../types/engine';
import type { ProcessNodeData } from '../../../../stores/blockStore';
import { getLibraryNamespace, getActivityKey } from '../../../../utils/activityI18n';
import { DataFrameViewerModal } from '../../DataFrameViewer/DataFrameViewerModal';
import type { DataFrameData } from '../../DataFrameViewer/index';

export interface ActivityBlockEditorProps {
  activity: Activity;
  data: ProcessNodeData;
  onUpdateActivityParam: (paramName: string, value: unknown) => void;
  onUpdateBuiltinSettings: (updates: Partial<NonNullable<ProcessNodeData['builtinSettings']>>) => void;
  onUpdateNode: (updates: Partial<ProcessNodeData>) => void;
  variables: VariableOption[];
  onCreateVariable: () => void;
  onOpenCodeEditor: (param: { name: string; value: string }) => void;
}

const ActivityBlockEditor: React.FC<ActivityBlockEditorProps> = ({
  activity,
  data,
  onUpdateActivityParam,
  onUpdateBuiltinSettings,
  onUpdateNode,
   variables,
   onCreateVariable,
   onOpenCodeEditor,
 }) => {
   const { t } = useTranslation('blocks');
   const { t: tActivity } = useTranslation(getLibraryNamespace(activity.library));
   const activityKey = getActivityKey(activity.id);
   const outputHint = activity.output_description
     ? tActivity(`activities.${activityKey}.output`, { defaultValue: activity.output_description })
     : '';

  const [dfViewerData, setDfViewerData] = useState<DataFrameData | null>(null);
  const [dfViewerOpen, setDfViewerOpen] = useState(false);

  const isDataFrameOutput =
    activity.has_output &&
    (activity.library === 'DataFrames' ||
      activity.output_description?.toLowerCase().includes('dataframe'));

  const handleViewDataFrame = () => {
    const varName = data.outputVariable || '';
    setDfViewerData({
      name: varName || activity.name,
      columns: [],
      rows: [],
      totalRows: 0,
    });
    setDfViewerOpen(true);
  };

  return (
    <>
      <div>
        <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.activity.parameters')}
        </div>
        <div className="space-y-3">
          {activity.params.length > 0 ? (
            activity.params.map((param) => (
              <ActivityParamEditor
                key={param.name}
                param={param}
                value={data.activityValues?.[param.name] ?? param.default ?? ''}
                onChange={onUpdateActivityParam}
                variables={variables}
                onCreateNew={onCreateVariable}
                onOpenCodeEditor={onOpenCodeEditor}
                activityLibrary={activity.library}
              />
            ))
          ) : (
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              {t('propertyEditors.activity.noParams')}
            </div>
          )}
        </div>
      </div>

      {activity.has_output && (
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('propertyEditors.activity.output')}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('propertyEditors.activity.saveResultToVariable')}
            </label>
            <VariablePicker
              value={data.outputVariable || ''}
              onChange={(value) => onUpdateNode({ outputVariable: value })}
              variables={variables}
              onCreateNew={onCreateVariable}
              placeholder={outputHint || 'Enter variable name...'}
            />
            {outputHint && (
              <div className="mt-1 text-xs text-slate-500">
                {outputHint}
              </div>
            )}
            {isDataFrameOutput && (
              <button
                type="button"
                onClick={handleViewDataFrame}
                className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded border border-teal-200 dark:border-teal-800 transition-colors"
                title={t('common.dataframeViewer.viewDataFrame', { defaultValue: 'View DataFrame' })}
              >
                <FiGrid size={12} />
                {t('common.dataframeViewer.viewDataFrame', { defaultValue: 'View DataFrame' })}
              </button>
            )}
          </div>
        </div>
      )}

      <DataFrameViewerModal
        isOpen={dfViewerOpen}
        data={dfViewerData}
        onClose={() => setDfViewerOpen(false)}
      />

      <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
        <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.activity.builtinSettings')}
        </div>
        <div className="space-y-3">
          {activity.timeout_ms > 0 && (
            <div>
              <label
                className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300"
                title={t('propertyEditors.activity.timeout')}
              >
                {t('propertyEditors.activity.timeout')}
              </label>
              <input
                type="number"
                min={1}
                className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                value={data.builtinSettings?.timeout ?? 30}
                onChange={(event) =>
                  onUpdateBuiltinSettings({
                    timeout: Number.parseInt(event.target.value || '30', 10),
                  })
                }
              />
            </div>
          )}

          {activity.has_retry && (
            <div className="space-y-2 rounded bg-slate-50 p-3 dark:bg-slate-800">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(data.builtinSettings?.retryEnabled)}
                  onChange={(event) =>
                    onUpdateBuiltinSettings({ retryEnabled: event.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span
                  className="font-medium text-slate-600 dark:text-slate-300"
                  title={t('propertyEditors.activity.enableRetry')}
                >
                  {t('propertyEditors.activity.enableRetry')}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-slate-500"
                    title={t('propertyEditors.activity.retryCount')}
                  >
                    {t('propertyEditors.activity.retryCount')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                    value={data.builtinSettings?.retryCount ?? 3}
                    onChange={(event) =>
                      onUpdateBuiltinSettings({
                        retryCount: Number.parseInt(event.target.value || '3', 10),
                      })
                    }
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-slate-500"
                    title={t('propertyEditors.activity.retryInterval')}
                  >
                    {t('propertyEditors.activity.retryInterval')}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                    value={data.builtinSettings?.retryInterval ?? '2s'}
                    onChange={(event) =>
                      onUpdateBuiltinSettings({ retryInterval: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {activity.has_continue_on_error && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(data.builtinSettings?.continueOnError)}
                onChange={(event) =>
                  onUpdateBuiltinSettings({ continueOnError: event.target.checked })
                }
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {t('propertyEditors.activity.continueOnError')}
              </span>
            </label>
          )}
        </div>
      </div>
    </>
  );
};

export default ActivityBlockEditor;
