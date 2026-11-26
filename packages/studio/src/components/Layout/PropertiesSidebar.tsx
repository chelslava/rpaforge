import React, { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCpu } from 'react-icons/fi';
import { PropertyPanel } from '../Designer/PropertyPanel';
import VariablesPanel from '../Designer/VariablesPanel';
import CallStackPanel from '../Debugger/CallStackPanel';
import ExecutionHistoryPanel from '../Debugger/ExecutionHistoryPanel';
import PanelErrorBoundary from '../Common/PanelErrorBoundary';

// Assistant dock (issue #903): lazy-loaded so the chat bundle (and its
// diff viewer dependency graph) stays out of the initial chunk.
const AssistantPanel = lazy(() => import('../Assistant/AssistantPanel'));

interface PropertiesSidebarProps {
  width: number;
  isDebugging: boolean;
}

const PropertiesSidebar: React.FC<PropertiesSidebarProps> = React.memo(({ width, isDebugging }) => {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<'properties' | 'variables' | 'assistant'>('properties');

  const tabClass = (active: boolean) =>
    `flex-1 px-3 py-2 text-sm font-medium ${active ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`;

  return (
    <aside style={{ width }} className="overflow-hidden flex-shrink-0 flex flex-col" data-tour="properties">
      {isDebugging ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col">
            <PanelErrorBoundary panelName="PropertyPanel">
              <PropertyPanel />
            </PanelErrorBoundary>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden border-t border-slate-200 dark:border-slate-700">
            <div className="flex-1 overflow-hidden">
              <PanelErrorBoundary panelName="ExecutionHistoryPanel">
                <ExecutionHistoryPanel />
              </PanelErrorBoundary>
            </div>
            <div className="flex-1 overflow-hidden border-t border-slate-200 dark:border-slate-700">
              <PanelErrorBoundary panelName="CallStackPanel">
                <CallStackPanel />
              </PanelErrorBoundary>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              className={tabClass(tab === 'properties')}
              onClick={() => setTab('properties')}
            >
              {t('sidebar.properties')}
            </button>
            <button
              className={tabClass(tab === 'variables')}
              onClick={() => setTab('variables')}
            >
              {t('sidebar.variables')}
            </button>
            <button
              className={tabClass(tab === 'assistant')}
              onClick={() => setTab('assistant')}
              aria-label={t('sidebar.assistant')}
              title={t('sidebar.assistant')}
            >
              <FiCpu className="h-4 w-4 mx-auto" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === 'properties' && (
              <PanelErrorBoundary panelName="PropertyPanel">
                <PropertyPanel />
              </PanelErrorBoundary>
            )}
            {tab === 'variables' && (
              <PanelErrorBoundary panelName="VariablesPanel">
                <VariablesPanel defaultExpanded={true} />
              </PanelErrorBoundary>
            )}
            {tab === 'assistant' && (
              <PanelErrorBoundary panelName="AssistantPanel">
                <Suspense
                  fallback={
                    <div className="p-3 text-xs text-ui-text-muted">
                      {t('sidebar.assistantLoading')}
                    </div>
                  }
                >
                  <AssistantPanel onClose={() => setTab('properties')} />
                </Suspense>
              </PanelErrorBoundary>
            )}
          </div>
        </div>
      )}
    </aside>
  );
});

PropertiesSidebar.displayName = 'PropertiesSidebar';

export default PropertiesSidebar;
