import React, { useCallback } from 'react';
import {
  FiCircle,
  FiX,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
} from 'react-icons/fi';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { Breakpoint } from '../../types/engine';

const BreakpointPanel: React.FC = () => {
  const {
    breakpoints,
    toggleBreakpoint,
    removeBreakpoint,
    clearBreakpoints,
  } = useDebuggerStore();

  const breakpointsList = Array.from(breakpoints.values());

  const handleToggle = useCallback(
    (id: string) => {
      toggleBreakpoint(id);
    },
    [toggleBreakpoint]
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeBreakpoint(id);
    },
    [removeBreakpoint]
  );

  const handleClearAll = useCallback(() => {
    clearBreakpoints();
  }, [clearBreakpoints]);

  if (breakpointsList.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Breakpoints</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            No breakpoints set
            <div className="text-xs mt-1">Click on a block to set a breakpoint</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold">Breakpoints ({breakpointsList.length})</h2>
        <button
          className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={handleClearAll}
          title="Clear all breakpoints"
        >
          <FiTrash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {breakpointsList.map((breakpoint: Breakpoint) => (
            <div
              key={breakpoint.id}
              className={`breakpoint-item p-2 rounded text-sm cursor-pointer transition-colors ${
                breakpoint.enabled
                  ? 'bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500'
                  : 'bg-slate-50 dark:bg-slate-800 opacity-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <FiCircle
                  className={`w-3 h-3 flex-shrink-0 ${
                    breakpoint.enabled ? 'text-red-500 fill-red-500' : 'text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-slate-900 dark:text-slate-100">
                    {breakpoint.file || 'Unknown file'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Line {breakpoint.line}
                    {breakpoint.condition && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        if {breakpoint.condition}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(breakpoint.id);
                  }}
                  title={breakpoint.enabled ? 'Disable' : 'Enable'}
                >
                  {breakpoint.enabled ? (
                    <FiToggleRight className="w-4 h-4 text-indigo-500" />
                  ) : (
                    <FiToggleLeft className="w-4 h-4" />
                  )}
                </button>
                <button
                  className="p-1 text-slate-400 hover:text-red-500 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(breakpoint.id);
                  }}
                  title="Remove breakpoint"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BreakpointPanel;
