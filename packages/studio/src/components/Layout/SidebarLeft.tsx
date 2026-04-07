import React from 'react';
import {
  FiSkipForward,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import ActivityPalette from '../Designer/ActivityPalette';
import VariablePanel from '../Debugger/VariablePanel';

interface SidebarLeftProps {
  activeTab: 'designer' | 'debugger' | 'console';
  isPaused: boolean;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
}

const SidebarLeft: React.FC<SidebarLeftProps> = ({
  activeTab,
  isPaused,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0">
      {activeTab === 'designer' && <ActivityPalette />}
      {activeTab === 'debugger' && (
        <div className="h-full flex flex-col">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold mb-2">Debug Controls</h2>
            <div className="space-y-1">
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={!isPaused}
                onClick={onStepOver}
              >
                <FiSkipForward className="w-4 h-4" />
                Step Over
              </button>
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={!isPaused}
                onClick={onStepInto}
              >
                <FiChevronDown className="w-4 h-4" />
                Step Into
              </button>
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={!isPaused}
                onClick={onStepOut}
              >
                <FiChevronUp className="w-4 h-4" />
                Step Out
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <VariablePanel />
          </div>
        </div>
      )}
      {activeTab === 'console' && (
        <div className="p-4">
          <h2 className="font-semibold mb-2">Console Settings</h2>
          <p className="text-sm text-slate-500">
            Console output is shown at the bottom of the screen.
          </p>
        </div>
      )}
    </aside>
  );
};

export default SidebarLeft;
