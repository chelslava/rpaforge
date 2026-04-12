import React from 'react';
import ProcessCanvas from '../Designer/ProcessCanvas';
import ConsoleOutput from '../Debugger/ConsoleOutput';
import CodePreviewPanel from '../Designer/CodePreviewPanel';
import DiagramTabs from '../Designer/DiagramTabs';
import BreadcrumbNavigation from '../Designer/BreadcrumbNavigation';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDiagramWorkspace } from '../../hooks/useDiagramWorkspace';

interface MainContentProps {
  activeTab: 'designer' | 'debugger' | 'console' | 'preview';
  showConsole: boolean;
}

const DebuggerWorkspace: React.FC = () => {
  return (
    <div className="h-full grid grid-rows-[minmax(0,1.6fr)_minmax(260px,1fr)] bg-slate-950/5 dark:bg-slate-950/20">
      <div className="min-h-0 border-b border-slate-200 dark:border-slate-700">
        <ProcessCanvas />
      </div>
      <div className="min-h-0 grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700">
        <div className="min-h-0">
          <CodePreviewPanel livePreview />
        </div>
        <div className="min-h-0">
          <ConsoleOutput />
        </div>
      </div>
    </div>
  );
};

const MainContent: React.FC<MainContentProps> = ({ activeTab, showConsole }) => {
  const project = useDiagramStore((state) => state.project);
  const openDiagram = useDiagramStore((state) => state.openDiagram);
  const closeDiagram = useDiagramStore((state) => state.closeDiagram);
  const showDiagramNavigation = Boolean(
    project && (activeTab === 'designer' || activeTab === 'debugger')
  );

  useDiagramWorkspace();

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {showDiagramNavigation && (
        <>
          <DiagramTabs
            onSelectDiagram={openDiagram}
            onCloseDiagram={closeDiagram}
          />
          <BreadcrumbNavigation />
        </>
      )}

      <div className="flex-1 overflow-hidden">
        {activeTab === 'designer' && <ProcessCanvas />}
        {activeTab === 'debugger' && <DebuggerWorkspace />}
        {activeTab === 'console' && <ConsoleOutput />}
        {activeTab === 'preview' && <CodePreviewPanel livePreview />}
      </div>

      {showConsole && activeTab === 'designer' && (
        <div className="h-48 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <ConsoleOutput />
        </div>
      )}
    </main>
  );
};

export default MainContent;
