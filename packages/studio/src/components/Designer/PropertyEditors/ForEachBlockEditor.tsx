import VariablePicker, { type VariableInfo } from '../VariablePicker';
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
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Item Variable
        </label>
        <VariablePicker
          value={blockData.itemVariable}
          onChange={(value) => onUpdateBlockData({ itemVariable: value })}
          variables={variables}
          onCreateNew={onCreateVariable}
          placeholder="${item}"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Collection
        </label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.collection}
          onChange={(event) => onUpdateBlockData({ collection: event.target.value })}
        />
        <div className="mt-1 text-xs text-slate-500">
          List or iterable variable (e.g., @{'{items}'})
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
          Parallel Execution
        </span>
      </label>
      {blockData.parallel && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          Items will be processed in parallel. Use with caution for side effects.
        </div>
      )}
      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        <strong>Body</strong> port: Connect activities to execute for each item.<br />
        <strong>Next</strong> port: Connect activities to execute after all items.
      </div>
    </>
  );
}

export default ForEachBlockEditor;
