import React from 'react';
import { FiPause, FiPlay, FiSquare, FiActivity } from 'react-icons/fi';
import type { ExecutionState, ExecutionSpeed } from '../../stores/processStore';
import type { ProcessMetadata } from '../../stores/processStore';
import type { Capabilities } from '../../types/engine';
import type { BridgeState } from '../../types/events';

interface StatusBarProps {
  activeTab: 'designer' | 'debugger' | 'console';
  bridgeState: BridgeState;
  capabilities: Capabilities | null;
  executionState: ExecutionState;
  executionSpeed: ExecutionSpeed;
  metadata: ProcessMetadata | null;
  showConsole: boolean;
  onToggleConsole: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  bridgeState,
  capabilities,
  executionState,
  executionSpeed,
  metadata,
  showConsole,
  onToggleConsole,
}) => {
  const runtimeSummary = capabilities
    ? `Engine ${capabilities.version} | ${
        capabilities.features.debugger ? 'Debugger' : 'No debugger'
      } | ${capabilities.libraries.length} libraries`
    : 'Capabilities unavailable';

  const getExecutionInfo = () => {
    switch (executionState) {
      case 'running':
        return (
          <span className="flex items-center gap-2 text-green-600">
            <FiPlay className="w-3 h-3" />
            Running
            <span className="flex items-center gap-1 text-slate-500">
              <FiActivity className="w-3 h-3" />
              {executionSpeed}x
            </span>
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1 text-yellow-600">
            <FiPause className="w-3 h-3" />
            Paused
          </span>
        );
      case 'stopped':
        return (
          <span className="flex items-center gap-1 text-red-500">
            <FiSquare className="w-3 h-3" />
            Stopped
          </span>
        );
      default:
        return <span className="text-slate-500">Ready</span>;
    }
  };

  return (
    <footer className="h-6 bg-slate-100 dark:bg-slate-800 text-xs flex items-center px-4 justify-between flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          {getExecutionInfo()}
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
