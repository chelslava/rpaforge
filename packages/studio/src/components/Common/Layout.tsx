import React, { useState } from 'react';
import {
  FiPlay,
  FiPause,
  FiSquare,
  FiSkipForward,
  FiChevronDown,
  FiChevronUp,
  FiRefreshCw,
} from 'react-icons/fi';
import ActivityPalette from '../Designer/ActivityPalette';
import ProcessCanvas from '../Designer/ProcessCanvas';
import PropertyPanel from '../Designer/PropertyPanel';
import ConsoleOutput from '../Debugger/ConsoleOutput';
import VariablePanel from '../Debugger/VariablePanel';
import CallStackPanel from '../Debugger/CallStackPanel';
import { useProcessStore } from '../../stores/processStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useEngine } from '../../hooks/useEngine';

type Tab = 'designer' | 'debugger' | 'console';

const Layout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('designer');
  const [showConsole, setShowConsole] = useState(true);

  const { executionState, metadata } = useProcessStore();
  const { isPaused } = useDebuggerStore();
  const {
    isConnected,
    isRunning,
    connect,
    runProcess,
    stopProcess,
    pauseProcess,
    resumeProcess,
  } = useEngine();

  const handleRun = async () => {
    if (!isConnected) {
      await connect();
    }
    if (metadata) {
      const source = generateRobotSource();
      await runProcess(source, metadata.name);
    }
  };

  const handleStop = async () => {
    await stopProcess();
  };

  const handlePause = async () => {
    await pauseProcess();
  };

  const handleResume = async () => {
    await resumeProcess();
  };

  const generateRobotSource = (): string => {
    return `*** Tasks ***
Main Task
    Log    Process executed from RPAForge Studio
`;
  };

  const getExecutionButton = () => {
    if (isRunning) {
      if (isPaused) {
        return (
          <button
            className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1"
            onClick={handleResume}
          >
            <FiPlay className="w-4 h-4" />
            Resume
          </button>
        );
      }
      return (
        <button
          className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-700 flex items-center gap-1"
          onClick={handlePause}
        >
          <FiPause className="w-4 h-4" />
          Pause
        </button>
      );
    }

    return (
      <button
        className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1"
        onClick={handleRun}
        disabled={!metadata}
      >
        <FiPlay className="w-4 h-4" />
        Run
      </button>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="h-12 bg-slate-800 text-white flex items-center px-4 justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">RPAForge Studio</h1>
          <nav className="flex gap-1">
            {(['designer', 'debugger', 'console'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
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
          {isConnected && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Connected
            </span>
          )}

          <div className="flex items-center gap-1">
            {getExecutionButton()}
            {isRunning && (
              <button
                className="px-3 py-1 bg-red-600 rounded hover:bg-red-700 flex items-center gap-1"
                onClick={handleStop}
              >
                <FiSquare className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
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
                  >
                    <FiSkipForward className="w-4 h-4" />
                    Step Over
                  </button>
                  <button
                    className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50"
                    disabled={!isPaused}
                  >
                    <FiChevronDown className="w-4 h-4" />
                    Step Into
                  </button>
                  <button
                    className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50"
                    disabled={!isPaused}
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

        <aside className="w-72 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0">
          {activeTab === 'designer' && <PropertyPanel />}
          {activeTab === 'debugger' && <CallStackPanel />}
        </aside>
      </div>

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
            onClick={() => setShowConsole(!showConsole)}
          >
            {showConsole ? 'Hide Console' : 'Show Console'}
          </button>
          <span className="text-slate-500">Python 3.11 | Robot Framework 7.0</span>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
