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
  return (
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
  );
}

export default StartBlockEditor;
