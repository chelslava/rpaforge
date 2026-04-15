import React, { useState, useCallback } from 'react';
import { FiX, FiFile, FiPhone } from 'react-icons/fi';
import { useDiagramStore, type DiagramType } from '../../stores/diagramStore';

interface DiagramTabsProps {
  onSelectDiagram: (id: string) => void;
  onCloseDiagram: (id: string) => void;
}

const DiagramTabs: React.FC<DiagramTabsProps> = ({
  onSelectDiagram,
  onCloseDiagram,
}) => {
  const { project, activeDiagramId, openDiagramIds, getDiagram, dirtyDiagramIds } = useDiagramStore();
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  const getDiagramIcon = (type: DiagramType) => {
    switch (type) {
      case 'main':
        return <FiFile className="w-3 h-3 text-green-500" />;
      case 'sub-diagram':
        return <FiPhone className="w-3 h-3 text-indigo-500" />;
      default:
        return <FiFile className="w-3 h-3 text-slate-400" />;
    }
  };

  const handleCloseClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (dirtyDiagramIds.has(id)) {
      setPendingCloseId(id);
    } else {
      onCloseDiagram(id);
    }
  }, [dirtyDiagramIds, onCloseDiagram]);

  const handleConfirmClose = useCallback(() => {
    if (pendingCloseId) {
      onCloseDiagram(pendingCloseId);
      setPendingCloseId(null);
    }
  }, [pendingCloseId, onCloseDiagram]);

  const handleCancelClose = useCallback(() => {
    setPendingCloseId(null);
  }, []);

  if (!project || openDiagramIds.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {openDiagramIds.map((id) => {
          const diagram = getDiagram(id);
          if (!diagram) return null;

          const isActive = id === activeDiagramId;
          const isDirty = dirtyDiagramIds.has(id);

          return (
            <div
              key={id}
              className={`group flex items-center gap-1.5 px-3 py-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer text-sm min-w-0 max-w-[180px] ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              onClick={() => onSelectDiagram(id)}
            >
              {getDiagramIcon(diagram.type)}
              <span className="truncate">{diagram.name}</span>
              {isDirty && (
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="Unsaved changes" />
              )}
              {diagram.type !== 'main' && (
                <button
                  className={`ml-1 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 ${
                    isActive || isDirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => handleCloseClick(e, id)}
                >
                  <FiX className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {pendingCloseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-4 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Unsaved Changes</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              This diagram has unsaved changes. Are you sure you want to close it?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelClose}
                className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Close Without Saving
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DiagramTabs;
