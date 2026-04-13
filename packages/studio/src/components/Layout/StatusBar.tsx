import React from 'react';
import { FiRefreshCw, FiPause } from 'react-icons/fi';
import type { ExecutionState } from '../../stores/processStore';
import type { ProcessMetadata } from '../../stores/processStore';
import type { Capabilities } from '../../types/engine';
import type { BridgeState } from '../../types/events';

interface StatusBarProps {
  activeTab: 'designer' | 'debugger' | 'console';
  bridgeState: BridgeState;
  capabilities: Capabilities | null;
  executionState: ExecutionState;
  metadata: ProcessMetadata | null;
  showConsole: boolean;
  onToggleConsole: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  bridgeState,
  capabilities,
  executionState,
  metadata,
  showConsole,
  onToggleConsole,
}) => {
  const runtimeSummary = capabilities
    ? `Engine ${capabilities.version} | ${
        capabilities.features.debugger ? 'Debugger' : 'No debugger'
      } | ${capabilities.libraries.length} libraries`
    : 'Capabilities unavailable';

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
        <span className="text-slate-500">Bridge: {bridgeState}</span>
      </div>
      <div className="flex items-center gap-4">
        {activeTab === 'designer' && (
          <button
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            onClick={onToggleConsole}
          >
            {showConsole ? 'Hide Console' : 'Show Console'}
          </button>
        )}
        <span className="text-slate-500">{runtimeSummary}</span>
      </div>
    </footer>
  );
};

export default StatusBar;
