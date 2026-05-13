import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiSkipForward,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import ActivityPalette from '../Designer/ActivityPalette';
import DiagramExplorer from '../Designer/DiagramExplorer';
import VariablePanel from '../Debugger/VariablePanel';
import BreakpointPanel from '../Debugger/BreakpointPanel';
import { useDiagramStore } from '../../stores/diagramStore';

interface SidebarLeftProps {
  activeTab: 'designer' | 'debugger' | 'console';
  isPaused: boolean;
  isStepLoading: boolean;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
}

const SidebarLeft: React.FC<SidebarLeftProps> = ({
  activeTab,
  isPaused,
  isStepLoading,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const [debugTab, setDebugTab] = useState<'variables' | 'breakpoints'>('variables');
  const [designerTab, setDesignerTab] = useState<'activities' | 'diagrams'>('activities');
  const { activeDiagramId, setActiveDiagram } = useDiagramStore();
  const { t } = useTranslation('common');

  return (
    <aside className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0">
      {activeTab === 'designer' && (
        <div className="h-full flex flex-col">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                designerTab === 'activities'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setDesignerTab('activities')}
            >
              {t('sidebar.activities')}
            </button>
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                designerTab === 'diagrams'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setDesignerTab('diagrams')}
            >
              {t('sidebar.diagrams')}
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {designerTab === 'activities' ? (
              <ActivityPalette />
            ) : (
              <DiagramExplorer
                onSelectDiagram={setActiveDiagram}
                activeDiagramId={activeDiagramId}
              />
            )}
          </div>
        </div>
      )}
      {activeTab === 'debugger' && (
        <div className="h-full flex flex-col">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold mb-2">{t('sidebar.debugControls')}</h2>
            <div className="space-y-1">
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isPaused || isStepLoading}
                onClick={onStepOver}
              >
                <FiSkipForward className="w-4 h-4" />
                {t('toolbar.stepOver')}
              </button>
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isPaused || isStepLoading}
                onClick={onStepInto}
              >
                <FiChevronDown className="w-4 h-4" />
                {t('toolbar.stepInto')}
              </button>
              <button
                className="w-full px-3 py-1.5 bg-slate-700 dark:bg-slate-600 text-white rounded text-sm hover:bg-slate-600 dark:hover:bg-slate-500 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isPaused || isStepLoading}
                onClick={onStepOut}
              >
                <FiChevronUp className="w-4 h-4" />
                {t('toolbar.stepOut')}
              </button>
            </div>
          </div>
          
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                debugTab === 'variables'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setDebugTab('variables')}
            >
              {t('sidebar.variables')}
            </button>
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${
                debugTab === 'breakpoints'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setDebugTab('breakpoints')}
            >
              {t('sidebar.breakpoints')}
            </button>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {debugTab === 'variables' ? <VariablePanel /> : <BreakpointPanel />}
          </div>
        </div>
      )}
      {activeTab === 'console' && (
        <div className="p-4">
          <h2 className="font-semibold mb-2">{t('sidebar.consoleSettings')}</h2>
          <p className="text-sm text-slate-500">
            {t('sidebar.consoleDescription')}
          </p>
        </div>
      )}
    </aside>
  );
};

export default SidebarLeft;
