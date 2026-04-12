import type { DiagramMetadata } from '../../../stores/diagramStore';
import type { BlockData } from '../../../types/blocks';

type SubDiagramCallBlock = Extract<BlockData, { type: 'sub-diagram-call' }>;

interface SubDiagramCallBlockEditorProps {
  blockData: SubDiagramCallBlock;
  selectedSubDiagram?: DiagramMetadata;
  onConfigureMappings: () => void;
  onOpenDiagram: () => void;
}

export function SubDiagramCallBlockEditor({
  blockData,
  selectedSubDiagram,
  onConfigureMappings,
  onOpenDiagram,
}: SubDiagramCallBlockEditorProps) {
  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            Sub-Diagram
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onConfigureMappings}
              disabled={!selectedSubDiagram}
            >
              Configure mappings
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onOpenDiagram}
              disabled={!selectedSubDiagram}
            >
              Open diagram
            </button>
          </div>
        </div>
        <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {selectedSubDiagram?.name || blockData.diagramName || 'Not selected'}
        </div>
        {selectedSubDiagram ? (
          <div className="mt-2 text-xs text-slate-500">
            Double-click the call block on the canvas or use “Open diagram” to navigate.
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-500">
            Drag a sub-diagram from the explorer onto the canvas to create a configured call.
          </div>
        )}
      </div>

      {blockData.parameters && Object.keys(blockData.parameters).length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Parameters
          </label>
          <div className="space-y-1">
            {Object.entries(blockData.parameters).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{key}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-600 dark:text-slate-300">{String(value) || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {blockData.returns && Object.keys(blockData.returns).length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Returns
          </label>
          <div className="space-y-1">
            {Object.entries(blockData.returns).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{String(value) || '—'}</span>
                <span className="text-slate-400">→</span>
                <span className="font-mono text-green-600 dark:text-green-400">{key}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default SubDiagramCallBlockEditor;
