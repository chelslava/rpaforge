import React from 'react';
import { FiChevronRight, FiFile, FiPhone } from 'react-icons/fi';
import { useDiagramStore, type DiagramType } from '../../stores/diagramStore';

interface BreadcrumbNavigationProps {
  callStack?: string[];
}

const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({ callStack }) => {
  const { project, activeDiagramId, openDiagram } = useDiagramStore();

  if (!project || !activeDiagramId) {
    return null;
  }

  const buildBreadcrumb = () => {
    const items: { id: string; name: string; type: DiagramType }[] = [];
    
    const activeDiagram = project.diagrams.find((d) => d.id === activeDiagramId);
    if (!activeDiagram) return [];

    if (callStack && callStack.length > 0) {
      for (const diagramId of callStack) {
        const diagram = project.diagrams.find((d) => d.id === diagramId);
        if (diagram) {
          items.push({ id: diagram.id, name: diagram.name, type: diagram.type });
        }
      }
    }

    items.push({ id: activeDiagram.id, name: activeDiagram.name, type: activeDiagram.type });

    return items;
  };

  const items = buildBreadcrumb();
  if (items.length === 0) return null;

  const getDiagramIcon = (type: DiagramType) => {
    switch (type) {
      case 'main':
        return <FiFile className="w-3.5 h-3.5 text-green-500" />;
      case 'sub-diagram':
        return <FiPhone className="w-3.5 h-3.5 text-indigo-500" />;
      case 'library':
        return <FiFile className="w-3.5 h-3.5 text-purple-500" />;
      default:
        return <FiFile className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const handleItemClick = (id: string) => {
    openDiagram(id);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-700 text-sm overflow-x-auto">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={item.id}>
            {index > 0 && (
              <FiChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
            <button
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                isLast
                  ? 'text-slate-900 dark:text-slate-100 font-medium bg-white dark:bg-slate-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => !isLast && handleItemClick(item.id)}
              disabled={isLast}
            >
              {getDiagramIcon(item.type)}
              <span className="truncate max-w-[120px]">{item.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default BreadcrumbNavigation;
