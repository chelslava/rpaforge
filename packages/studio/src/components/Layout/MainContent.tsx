import React, { useState, useRef, useCallback, useEffect } from 'react';
import ProcessCanvas from '../Designer/ProcessCanvas';
import ConsoleOutput from '../Debugger/ConsoleOutput';
import DiagramTabs from '../Designer/DiagramTabs';
import BreadcrumbNavigation from '../Designer/BreadcrumbNavigation';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDiagramWorkspace } from '../../hooks/useDiagramWorkspace';

interface MainContentProps {
  showConsole: boolean;
}

const MainContent: React.FC<MainContentProps> = ({ showConsole }) => {
  const project = useDiagramStore((state) => state.project);
  const openDiagram = useDiagramStore((state) => state.openDiagram);
  const closeDiagram = useDiagramStore((state) => state.closeDiagram);
  useDiagramWorkspace();

  const [consoleHeight, setConsoleHeight] = useState(192);
  const consoleResizeState = useRef<{ active: boolean; startY: number; startHeight: number }>({ active: false, startY: 0, startHeight: 0 });

  const handleConsoleResizeStart = useCallback((e: React.MouseEvent) => {
    consoleResizeState.current = { active: true, startY: e.clientY, startHeight: consoleHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [consoleHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!consoleResizeState.current.active) return;
      const { startY, startHeight } = consoleResizeState.current;
      setConsoleHeight(Math.max(80, Math.min(600, startHeight - e.clientY + startY)));
    };
    const handleMouseUp = () => {
      consoleResizeState.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {project && (
        <>
          <DiagramTabs onSelectDiagram={openDiagram} onCloseDiagram={closeDiagram} />
          <BreadcrumbNavigation />
        </>
      )}
      <div className="flex-1 overflow-hidden" data-tour="canvas">
        <ProcessCanvas />
      </div>
      {showConsole && (
        <>
          <div
            className="h-1 flex-shrink-0 cursor-row-resize bg-slate-200 dark:bg-slate-700 hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors"
            onMouseDown={handleConsoleResizeStart}
          />
          <div style={{ height: consoleHeight }} className="flex-shrink-0">
            <ConsoleOutput />
          </div>
        </>
      )}
    </main>
  );
};

export default MainContent;
