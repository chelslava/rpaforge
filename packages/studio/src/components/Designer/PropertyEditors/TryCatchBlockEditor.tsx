import { FiPlus, FiX } from 'react-icons/fi';

import type { BlockData } from '../../../types/blocks';

type TryCatchBlock = Extract<BlockData, { type: 'try-catch' }>;

interface TryCatchBlockEditorProps {
  blockData: TryCatchBlock;
  onUpdateExceptBlock: (
    index: number,
    updates: { exceptionType?: string; variable?: string }
  ) => void;
  onAddExceptBlock: () => void;
  onRemoveExceptBlock: (index: number) => void;
  onToggleFinallyBlock: (enabled: boolean) => void;
}

const EXCEPTION_TYPES = [
  { value: 'Exception', label: 'Exception', description: 'All exceptions' },
  { value: 'ValueError', label: 'ValueError', description: 'Invalid value' },
  { value: 'TypeError', label: 'TypeError', description: 'Wrong type' },
  { value: 'RuntimeError', label: 'RuntimeError', description: 'Runtime error' },
  { value: 'KeyError', label: 'KeyError', description: 'Key not found' },
  { value: 'IndexError', label: 'IndexError', description: 'Index out of range' },
  { value: 'AttributeError', label: 'AttributeError', description: 'Attribute not found' },
  { value: 'ImportError', label: 'ImportError', description: 'Import failed' },
  { value: 'OSError', label: 'OSError', description: 'OS error' },
  { value: 'TimeoutError', label: 'TimeoutError', description: 'Operation timed out' },
  { value: 'FileNotFoundError', label: 'FileNotFoundError', description: 'File not found' },
  { value: 'PermissionError', label: 'PermissionError', description: 'Permission denied' },
  { value: 'ConnectionError', label: 'ConnectionError', description: 'Connection failed' },
];

export function TryCatchBlockEditor({
  blockData,
  onUpdateExceptBlock,
  onAddExceptBlock,
  onRemoveExceptBlock,
  onToggleFinallyBlock,
}: TryCatchBlockEditorProps) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Exception handlers
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onAddExceptBlock}
          >
            <FiPlus className="h-3.5 w-3.5" />
            Add handler
          </button>
        </div>
        <div className="space-y-2">
          {blockData.exceptBlocks.length > 0 ? (
            blockData.exceptBlocks.map((exceptBlock, index) => (
              <div
                key={exceptBlock.id}
                className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Handler {index + 1}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                    onClick={() => onRemoveExceptBlock(index)}
                    title="Remove handler"
                  >
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Exception type
                    </label>
                    <select
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={exceptBlock.exceptionType || 'Exception'}
                      onChange={(event) =>
                        onUpdateExceptBlock(index, {
                          exceptionType: event.target.value,
                        })
                      }
                    >
                      {EXCEPTION_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Variable
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={exceptBlock.variable || ''}
                      onChange={(event) =>
                        onUpdateExceptBlock(index, { variable: event.target.value })
                      }
                      placeholder="e"
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              No EXCEPT handlers configured. Add one to expose the error path semantics.
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(blockData.finallyBlock)}
          onChange={(event) => onToggleFinallyBlock(event.target.checked)}
          className="rounded border-slate-300 dark:border-slate-600"
        />
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Enable FINALLY path
        </span>
      </label>

      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        Success, EXCEPT and optional FINALLY handles are exposed directly on the block.
      </div>
    </div>
  );
}

export default TryCatchBlockEditor;
