import React from 'react';
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
  const { project, activeDiagramId, openDiagramIds, getDiagram } = useDiagramStore();

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

  if (!project || openDiagramIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
      {openDiagramIds.map((id) => {
        const diagram = getDiagram(id);
        if (!diagram) return null;

        const isActive = id === activeDiagramId;

        return (
          <div
            key={id}
            className={`flex items-center gap-1.5 px-3 py-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer text-sm min-w-0 max-w-[180px] ${
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            onClick={() => onSelectDiagram(id)}
          >
            {getDiagramIcon(diagram.type)}
            <span className="truncate">{diagram.name}</span>
            {diagram.type !== 'main' && (
              <button
                className={`ml-1 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDiagram(id);
                }}
              >
                <FiX className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DiagramTabs;
