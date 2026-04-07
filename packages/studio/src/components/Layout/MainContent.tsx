import React from 'react';
import ProcessCanvas from '../Designer/ProcessCanvas';
import ConsoleOutput from '../Debugger/ConsoleOutput';

interface MainContentProps {
  activeTab: 'designer' | 'debugger' | 'console';
  showConsole: boolean;
}

const MainContent: React.FC<MainContentProps> = ({ activeTab, showConsole }) => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {activeTab === 'designer' && <ProcessCanvas />}
        {activeTab === 'debugger' && <ProcessCanvas />}
        {activeTab === 'console' && <ConsoleOutput />}
      </div>

      {showConsole && activeTab !== 'console' && (
        <div className="h-48 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <ConsoleOutput />
        </div>
      )}
    </main>
  );
};

export default MainContent;
