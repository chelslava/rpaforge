import React from 'react';
import { FiRefreshCw, FiPause } from 'react-icons/fi';
import type { ExecutionState } from '../../stores/processStore';
import type { ProcessMetadata } from '../../stores/processStore';

interface StatusBarProps {
  executionState: ExecutionState;
  metadata: ProcessMetadata | null;
  showConsole: boolean;
  onToggleConsole: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  executionState,
  metadata,
  showConsole,
  onToggleConsole,
}) => {
  return (
    <footer className="h-6 bg-slate-100 dark:bg-slate-800 text-xs flex items-center px-4 justify-between flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span
          className={`flex items-center gap-1 ${
            executionState === 'running'
              ? 'text-green-600'
              : executionState === 'paused'
              ? 'text-yellow-600'
              : 'text-slate-500'
          }`}
        >
          {executionState === 'running' && (
            <>
              <FiRefreshCw className="w-3 h-3 animate-spin" />
              Running
            </>
          )}
          {executionState === 'paused' && (
            <>
              <FiPause className="w-3 h-3" />
              Paused
            </>
          )}
          {executionState === 'idle' && 'Ready'}
          {executionState === 'stopped' && 'Stopped'}
        </span>
        {metadata && <span className="text-slate-500">{metadata.name}</span>}
      </div>
      <div className="flex items-center gap-4">
        <button
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          onClick={onToggleConsole}
        >
          {showConsole ? 'Hide Console' : 'Show Console'}
        </button>
        <span className="text-slate-500">Python 3.11 | Robot Framework 7.0</span>
      </div>
    </footer>
  );
};

export default StatusBar;
