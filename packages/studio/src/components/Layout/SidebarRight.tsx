import React from 'react';
import PropertyPanel from '../Designer/PropertyPanel';
import VariablesPanel from '../Designer/VariablesPanel';
import CallStackPanel from '../Debugger/CallStackPanel';

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
      {activeTab === 'debugger' && <CallStackPanel />}
    </aside>
  );
};

export default SidebarRight;
