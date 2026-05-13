import ExpressionEditor from '../ExpressionEditor';
import VariablePicker, { type VariableInfo } from '../VariablePicker';
import type { BlockData } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

type AssignBlock = Extract<BlockData, { type: 'assign' }>;

interface AssignBlockEditorProps {
  blockData: AssignBlock;
  variables: VariableInfo[];
  onCreateVariable: () => void;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function AssignBlockEditor({
  blockData,
  variables,
  onCreateVariable,
  onUpdateBlockData,
}: AssignBlockEditorProps) {
  const { t } = useTranslation('blocks');
  const { t: tCommon } = useTranslation('common');

  const VARIABLE_TYPES = [
    { value: 'string', label: tCommon('variableDialog.type_string') },
    { value: 'number', label: tCommon('variableDialog.type_number') },
    { value: 'boolean', label: tCommon('variableDialog.type_boolean') },
    { value: 'list', label: tCommon('variableDialog.type_list') },
    { value: 'dict', label: tCommon('variableDialog.type_dictionary') },
    { value: 'any', label: tCommon('variableDialog.type_any') },
  ];

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('assign.variableName')}
        </label>
        <VariablePicker
          value={blockData.variableName}
          onChange={(value) => onUpdateBlockData({ variableName: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder={t('assign.variableNamePlaceholder')}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('assign.variableType')}
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.variableType || 'any'}
          onChange={(event) => onUpdateBlockData({ variableType: event.target.value })}
        >
          {VARIABLE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('assign.expression')}
        </label>
        <ExpressionEditor
          value={blockData.expression}
          onChange={(value) => onUpdateBlockData({ expression: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder={t('assign.expressionPlaceholder')}
          rows={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('assign.scope')}
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.scope || 'process'}
          onChange={(event) => onUpdateBlockData({ scope: event.target.value })}
        >
          <option value="process">{t('assign.processScope')}</option>
          <option value="task">{t('assign.taskScope')}</option>
        </select>
        <div className="mt-1 text-xs text-slate-500">{t('assign.scopeHint')}</div>
      </div>
    </>
  );
}

export default AssignBlockEditor;
