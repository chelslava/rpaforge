import React from 'react';
import PropertyPanel from '../Designer/PropertyPanel';
import VariablesPanel from '../Designer/VariablesPanel';
import CallStackPanel from '../Debugger/CallStackPanel';
import ExecutionHistoryPanel from '../Debugger/ExecutionHistoryPanel';

interface SidebarRightProps {
  activeTab: 'designer' | 'debugger' | 'console';
}

const SidebarRight: React.FC<SidebarRightProps> = ({ activeTab }) => {
  return (
    <aside className="w-72 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 flex flex-col">
      {activeTab === 'designer' && (
        <>
          <div className="flex-1 overflow-hidden flex flex-col">
            <PropertyPanel />
          </div>
          <VariablesPanel defaultExpanded={true} />
        </>
      )}
      {activeTab === 'debugger' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ExecutionHistoryPanel />
          </div>
          <div className="flex-1 overflow-hidden border-t border-slate-200 dark:border-slate-700">
            <CallStackPanel />
          </div>
        </div>
      )}
    </aside>
  );
};

export default SidebarRight;
