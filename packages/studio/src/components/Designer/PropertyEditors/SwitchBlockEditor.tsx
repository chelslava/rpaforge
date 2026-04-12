import { FiPlus, FiX } from 'react-icons/fi';

import type { BlockData } from '../../../types/blocks';

type SwitchBlock = Extract<BlockData, { type: 'switch' }>;

interface SwitchBlockEditorProps {
  blockData: SwitchBlock;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
  onUpdateSwitchCase: (
    index: number,
    updates: { value?: string; label?: string }
  ) => void;
  onAddSwitchCase: () => void;
  onRemoveSwitchCase: (index: number) => void;
}

export function SwitchBlockEditor({
  blockData,
  onUpdateBlockData,
  onUpdateSwitchCase,
  onAddSwitchCase,
  onRemoveSwitchCase,
}: SwitchBlockEditorProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Expression
        </label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.expression}
          onChange={(event) => onUpdateBlockData({ expression: event.target.value })}
        />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Cases
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onAddSwitchCase}
          >
            <FiPlus className="h-3.5 w-3.5" />
            Add case
          </button>
        </div>
        <div className="space-y-2">
          {blockData.cases.length > 0 ? (
            blockData.cases.map((switchCase, index) => (
              <div
                key={switchCase.id}
                className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Case {index + 1}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                    onClick={() => onRemoveSwitchCase(index)}
                    title="Remove case"
                  >
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Label
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={switchCase.label}
                      onChange={(event) =>
                        onUpdateSwitchCase(index, { label: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Value
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={switchCase.value}
                      onChange={(event) =>
                        onUpdateSwitchCase(index, { value: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              No cases configured. Add cases to expose dedicated switch outputs.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SwitchBlockEditor;
