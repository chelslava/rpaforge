import React from 'react';
import {
  FiPlay,
  FiPause,
  FiSquare,
  FiCode,
  FiArrowDownCircle,
  FiArrowDownRight,
  FiArrowUpCircle,
} from 'react-icons/fi';
import FileMenu from '../Common/FileMenu';

import type { BridgeState } from '../../types/events';

interface ToolbarProps {
  activeTab: 'designer' | 'debugger' | 'console' | 'preview';
  onTabChange: (tab: 'designer' | 'debugger' | 'console' | 'preview') => void;
  isConnected: boolean;
  bridgeState: BridgeState;
  isRunning: boolean;
  isPaused: boolean;
  isStepLoading: boolean;
  hasMetadata: boolean;
  hasNodes: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExportCode: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  activeTab,
  onTabChange,
  isConnected,
  bridgeState,
  isRunning,
  isPaused,
  isStepLoading,
  hasMetadata,
  hasNodes,
  onRun,
  onPause,
  onResume,
  onStop,
  onExportCode,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const getExecutionButton = () => {
    if (isRunning) {
      if (isPaused) {
        return (
          <button
            className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1"
            onClick={onResume}
          >
            <FiPlay className="w-4 h-4" />
            Resume
          </button>
        );
      }
      return (
        <button
          className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-700 flex items-center gap-1"
          onClick={onPause}
        >
          <FiPause className="w-4 h-4" />
          Pause
        </button>
      );
    }

    return (
      <button
        className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1"
        onClick={onRun}
        disabled={!hasMetadata}
      >
        <FiPlay className="w-4 h-4" />
        Run
      </button>
    );
  };

  const bridgeBadge = {
    starting: 'text-blue-400',
    ready: 'text-green-400',
    degraded: 'text-yellow-400',
    reconnecting: 'text-amber-400',
    stopped: 'text-slate-400',
  }[bridgeState];

  const bridgeLabel = bridgeState.charAt(0).toUpperCase() + bridgeState.slice(1);

  return (
    <header className="h-12 bg-slate-800 text-white flex items-center px-4 justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">RPAForge Studio</h1>
        <FileMenu />
        <nav className="flex gap-1">
          {(['designer', 'preview', 'debugger', 'console'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3 py-1 rounded capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-700 text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-xs flex items-center gap-1 ${bridgeBadge}`}>
          <span className={`w-2 h-2 rounded-full ${bridgeState === 'ready' ? 'bg-green-400' : bridgeState === 'degraded' ? 'bg-yellow-400' : bridgeState === 'reconnecting' ? 'bg-amber-400' : bridgeState === 'starting' ? 'bg-blue-400' : 'bg-slate-400'}`} />
          Bridge {bridgeLabel}
          {isConnected && bridgeState === 'ready' ? '' : ''}
        </span>

        <div className="flex items-center gap-1">
          <button
            className="px-3 py-1 bg-slate-600 rounded hover:bg-slate-700 flex items-center gap-1"
            onClick={onExportCode}
            disabled={!hasNodes}
            title="Export to Robot Framework"
          >
            <FiCode className="w-4 h-4" />
            Export
          </button>
          {getExecutionButton()}
          {isRunning && isPaused && (
            <>
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepOver}
                disabled={isStepLoading}
                title="Step Over (F6)"
              >
                <FiArrowDownCircle className="w-4 h-4" />
                Over
              </button>
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepInto}
                disabled={isStepLoading}
                title="Step Into (F7)"
              >
                <FiArrowDownRight className="w-4 h-4" />
                Into
              </button>
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepOut}
                disabled={isStepLoading}
                title="Step Out (F8)"
              >
                <FiArrowUpCircle className="w-4 h-4" />
                Out
              </button>
            </>
          )}
          {isRunning && (
            <button
              className="px-3 py-1 bg-red-600 rounded hover:bg-red-700 flex items-center gap-1"
              onClick={onStop}
            >
              <FiSquare className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Toolbar;
