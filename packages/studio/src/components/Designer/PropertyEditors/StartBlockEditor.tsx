import { FiPlus, FiX } from 'react-icons/fi';
import type { BlockData } from '../../../types/blocks';

type StartBlock = Extract<BlockData, { type: 'start' }>;

interface StartBlockEditorProps {
  blockData: StartBlock;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function StartBlockEditor({
  blockData,
  onUpdateBlockData,
}: StartBlockEditorProps) {
  const tags = blockData.tags || [];

  const handleAddTag = () => {
    const newTag = prompt('Enter tag name:');
    if (newTag && newTag.trim() && !tags.includes(newTag.trim())) {
      onUpdateBlockData({ tags: [...tags, newTag.trim()] });
    }
  };

  const handleRemoveTag = (index: number) => {
    onUpdateBlockData({ tags: tags.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Process Name
        </label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.processName}
          onChange={(event) => onUpdateBlockData({ processName: event.target.value })}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Tags
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={handleAddTag}
          >
            <FiPlus className="h-3.5 w-3.5" />
            Add tag
          </button>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {tag}
                <button
                  type="button"
                  className="rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800"
                  onClick={() => handleRemoveTag(index)}
                >
                  <FiX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            No tags. Add tags to categorize this process.
          </div>
        )}
      </div>
    </div>
  );
}

export default StartBlockEditor;
