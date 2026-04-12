import ExpressionEditor from '../ExpressionEditor';
import VariablePicker, { type VariableInfo } from '../VariablePicker';
import type { BlockData } from '../../../types/blocks';

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
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Variable Name
        </label>
        <VariablePicker
          value={blockData.variableName}
          onChange={(value) => onUpdateBlockData({ variableName: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder="${variable_name}"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Expression
        </label>
        <ExpressionEditor
          value={blockData.expression}
          onChange={(value) => onUpdateBlockData({ expression: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder="value or ${other_var}"
          rows={2}
        />
      </div>
    </>
  );
}

export default AssignBlockEditor;
