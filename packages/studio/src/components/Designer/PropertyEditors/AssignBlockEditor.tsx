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

const VARIABLE_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'list', label: 'List' },
  { value: 'dict', label: 'Dictionary' },
  { value: 'any', label: 'Any' },
];

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
          placeholder="variable_name"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Variable Type
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
          Expression
        </label>
        <ExpressionEditor
          value={blockData.expression}
          onChange={(value) => onUpdateBlockData({ expression: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder="value or other_var"
          rows={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Scope
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.scope || 'process'}
          onChange={(event) => onUpdateBlockData({ scope: event.target.value })}
        >
          <option value="process">Process (global)</option>
          <option value="task">Task (local)</option>
        </select>
        <div className="mt-1 text-xs text-slate-500">
          Process scope = available everywhere. Task scope = only in current task.
        </div>
      </div>
    </>
  );
}

export default AssignBlockEditor;
