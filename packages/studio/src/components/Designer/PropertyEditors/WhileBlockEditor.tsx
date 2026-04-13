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
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Condition
        </label>
        <ExpressionEditor
          value={blockData.condition}
          onChange={(value) => onUpdateBlockData({ condition: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder="True"
          rows={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Max Iterations
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
          Safety limit to prevent infinite loops
        </div>
      </div>
      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <strong>Body</strong> port: Connect activities to execute inside the loop.<br />
        <strong>Next</strong> port: Connect activities to execute after the loop.
      </div>
    </>
  );
}

export default WhileBlockEditor;
