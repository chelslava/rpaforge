import { useTranslation } from 'react-i18next';
import ExpressionEditor from '../ExpressionEditor';
import type { VariableInfo } from '../VariablePicker';
import type { BlockData } from '../../../types/blocks';

type WhileBlock = Extract<BlockData, { type: 'while' }>;

interface WhileBlockEditorProps {
  blockData: WhileBlock;
  variables: VariableInfo[];
  onCreateVariable: () => void;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function WhileBlockEditor({
  blockData,
  variables,
  onCreateVariable,
  onUpdateBlockData,
}: WhileBlockEditorProps) {
  const { t } = useTranslation('common');
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('whileBlockEditor.condition')}
        </label>
        <ExpressionEditor
          value={blockData.condition}
          onChange={(value) => onUpdateBlockData({ condition: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder={t('whileBlockEditor.conditionPlaceholder')}
          rows={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('whileBlockEditor.maxIterations')}
        </label>
        <input
          type="number"
          min={1}
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.maxIterations ?? 100}
          onChange={(event) =>
            onUpdateBlockData({
              maxIterations: Number.parseInt(event.target.value || '100', 10),
            })
          }
        />
        <div className="mt-1 text-xs text-slate-500">
          {t('whileBlockEditor.maxIterationsHelp')}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('whileBlockEditor.timeout')}
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
          {t('whileBlockEditor.timeoutHelp')}
        </div>
      </div>
      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <strong>{t('whileBlockEditor.bodyPort')}</strong> port: {t('whileBlockEditor.bodyPortHelp')}<br />
        <strong>{t('whileBlockEditor.nextPort')}</strong> port: {t('whileBlockEditor.nextPortHelp')}
      </div>
    </>
  );
}

export default WhileBlockEditor;
