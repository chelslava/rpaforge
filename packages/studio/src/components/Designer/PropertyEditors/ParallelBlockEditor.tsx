import { FiPlus, FiX } from 'react-icons/fi';

import type { BlockData } from '../../../types/blocks';

type ParallelBlock = Extract<BlockData, { type: 'parallel' }>;

interface ParallelBlockEditorProps {
  blockData: ParallelBlock;
  onUpdateParallelBranch: (index: number, updates: { name?: string }) => void;
  onAddParallelBranch: () => void;
  onRemoveParallelBranch: (index: number) => void;
}

export function ParallelBlockEditor({
  blockData,
  onUpdateParallelBranch,
  onAddParallelBranch,
  onRemoveParallelBranch,
}: ParallelBlockEditorProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
          Branches
        </label>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={onAddParallelBranch}
        >
          <FiPlus className="h-3.5 w-3.5" />
          Add branch
        </button>
      </div>
      <div className="space-y-2">
        {(blockData.branches.length > 0
          ? blockData.branches
          : [
              { id: 'branch-1', name: 'Branch 1', activities: [] },
              { id: 'branch-2', name: 'Branch 2', activities: [] },
            ]).map((branch, index) => (
          <div
            key={branch.id}
            className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800"
          >
            <input
              type="text"
              className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
              value={branch.name}
              onChange={(event) =>
                onUpdateParallelBranch(index, { name: event.target.value })
              }
            />
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
              onClick={() => onRemoveParallelBranch(index)}
              title="Remove branch"
              disabled={blockData.branches.length <= 1}
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Each branch creates a dedicated parallel output handle on the node.
      </div>
    </div>
  );
}

export default ParallelBlockEditor;
