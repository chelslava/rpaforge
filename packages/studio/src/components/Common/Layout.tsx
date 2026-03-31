import React, { useState } from 'react';
import ActivityPalette from '../Designer/ActivityPalette';
import ProcessCanvas from '../Designer/ProcessCanvas';
import PropertyPanel from '../Designer/PropertyPanel';
import ConsoleOutput from '../Debugger/ConsoleOutput';
import VariablePanel from '../Debugger/VariablePanel';
import CallStackPanel from '../Debugger/CallStackPanel';

type Tab = 'designer' | 'debugger' | 'console';

const Layout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('designer');

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 bg-slate-800 text-white flex items-center px-4 justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">RPAForge Studio</h1>
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveTab('designer')}
              className={`px-3 py-1 rounded ${
                activeTab === 'designer' ? 'bg-indigo-600' : 'hover:bg-slate-700'
              }`}
            >
              Designer
            </button>
            <button
              onClick={() => setActiveTab('debugger')}
              className={`px-3 py-1 rounded ${
                activeTab === 'debugger' ? 'bg-indigo-600' : 'hover:bg-slate-700'
              }`}
            >
              Debugger
            </button>
            <button
              onClick={() => setActiveTab('console')}
              className={`px-3 py-1 rounded ${
                activeTab === 'console' ? 'bg-indigo-600' : 'hover:bg-slate-700'
              }`}
            >
              Console
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 bg-green-600 rounded hover:bg-green-700">
            Run
          </button>
          <button className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-700">
            Debug
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 overflow-auto">
          {activeTab === 'designer' && <ActivityPalette />}
          {activeTab === 'debugger' && (
            <div className="p-2">
              <button className="w-full mb-2 px-3 py-1 bg-slate-700 text-white rounded text-sm">
                Step Over
              </button>
              <button className="w-full mb-2 px-3 py-1 bg-slate-700 text-white rounded text-sm">
                Step Into
              </button>
              <button className="w-full mb-2 px-3 py-1 bg-slate-700 text-white rounded text-sm">
                Step Out
              </button>
              <button className="w-full px-3 py-1 bg-green-600 text-white rounded text-sm">
                Continue
              </button>
            </div>
          )}
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'designer' && <ProcessCanvas />}
          {activeTab === 'debugger' && <VariablePanel />}
          {activeTab === 'console' && <ConsoleOutput />}
        </main>

        {/* Right Sidebar */}
        <aside className="w-72 border-l border-slate-200 dark:border-slate-700 overflow-auto">
          {activeTab === 'designer' && <PropertyPanel />}
          {activeTab === 'debugger' && <CallStackPanel />}
        </aside>
      </div>

      {/* Footer */}
      <footer className="h-6 bg-slate-200 dark:bg-slate-800 text-xs flex items-center px-4 justify-between">
        <span>Ready</span>
        <span>Python 3.11 | Robot Framework 7.0</span>
      </footer>
    </div>
  );
};

export default Layout;
