import { useTranslation } from 'react-i18next';
import VariablePicker, { type VariableInfo } from '../VariablePicker';
import ExpressionEditor from '../ExpressionEditor';
import type { BlockData } from '../../../types/blocks';

type ForEachBlock = Extract<BlockData, { type: 'for-each' }>;

interface ForEachBlockEditorProps {
  blockData: ForEachBlock;
  variables: VariableInfo[];
  onCreateVariable: () => void;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function ForEachBlockEditor({
  blockData,
  variables,
  onCreateVariable,
  onUpdateBlockData,
}: ForEachBlockEditorProps) {
  const { t } = useTranslation('common');
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('forEachBlockEditor.itemVariable')}
        </label>
        <VariablePicker
          value={blockData.itemVariable}
          onChange={(value) => onUpdateBlockData({ itemVariable: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder={t('forEachBlockEditor.itemPlaceholder')}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('forEachBlockEditor.collection')}
        </label>
        <ExpressionEditor
          value={blockData.collection}
          onChange={(value) => onUpdateBlockData({ collection: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder={t('forEachBlockEditor.collectionPlaceholder')}
          rows={2}
        />
        <div className="mt-1 text-xs text-slate-500">
          {t('forEachBlockEditor.collectionHelp')}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(blockData.parallel)}
          onChange={(event) => onUpdateBlockData({ parallel: event.target.checked })}
          className="rounded border-slate-300 dark:border-slate-600"
        />
        <span className="font-medium text-slate-600 dark:text-slate-300">
          {t('forEachBlockEditor.parallelExecution')}
        </span>
      </label>
      {blockData.parallel && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          {t('forEachBlockEditor.parallelWarning')}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('forEachBlockEditor.timeout')}
        </label>
        <input
          type="number"
          min={0}
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.timeout ?? 0}
          onChange={(event) =>
            onUpdateBlockData({
              timeout: Number.parseInt(event.target.value || '0', 10),
            })
          }
        />
        <div className="mt-1 text-xs text-slate-500">
          {t('forEachBlockEditor.timeoutHelp')}
        </div>
      </div>
      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <strong>{t('forEachBlockEditor.bodyPortHelp')}</strong><br />
        <strong>{t('forEachBlockEditor.nextPortHelp')}</strong>
      </div>
    </>
  );
}

export default ForEachBlockEditor;
