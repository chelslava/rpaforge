import React from 'react';
import { FiChevronRight, FiFile } from 'react-icons/fi';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { CallFrame } from '../../types/engine';

const CallStackPanel: React.FC = () => {
  const { callStack, currentLine } = useDebuggerStore();

  if (callStack.length === 0) {
    return (
      <div className="p-4">
        <h2 className="font-semibold mb-4">Call Stack</h2>
        <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
          No call stack available
          <div className="text-xs mt-1">Start debugging to see the call stack</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold">Call Stack</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {callStack.map((frame: CallFrame, index: number) => {
            const isCurrentFrame =
              currentLine === frame.line;

            return (
              <div
                key={`${frame.library}-${frame.activity}-${frame.line}-${index}`}
                className={`call-stack-frame p-2 rounded text-sm cursor-pointer transition-colors ${
                  isCurrentFrame
                    ? 'bg-indigo-100 dark:bg-indigo-900 border-l-2 border-indigo-500'
                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCurrentFrame ? (
                    <FiChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  ) : (
                    <div className="w-4" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{frame.activity}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <FiFile className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {frame.library}:{frame.line}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CallStackPanel;
