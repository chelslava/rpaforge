import { useTranslation } from 'react-i18next';
import ExpressionEditor from '../ExpressionEditor';
import type { VariableInfo } from '../VariablePicker';
import type { BlockData } from '../../../types/blocks';

type IfBlock = Extract<BlockData, { type: 'if' }>;

interface IfBlockEditorProps {
  blockData: IfBlock;
  variables: VariableInfo[];
  onCreateVariable: () => void;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function IfBlockEditor({
  blockData,
  variables,
  onCreateVariable,
  onUpdateBlockData,
}: IfBlockEditorProps) {
  const { t } = useTranslation('common');
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {t('ifBlockEditor.condition')}
      </label>
      <ExpressionEditor
        value={blockData.condition}
        onChange={(value) => onUpdateBlockData({ condition: value })}
        variables={variables}
        onCreateNew={onCreateVariable}
        placeholder={t('ifBlockEditor.conditionPlaceholder')}
        rows={2}
      />
    </div>
  );
}

export default IfBlockEditor;
