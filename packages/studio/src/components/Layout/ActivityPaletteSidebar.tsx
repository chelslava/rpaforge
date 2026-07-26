import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import {
  FiSkipForward,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import ActivityPalette from '../Designer/ActivityPalette';
import DiagramExplorer from '../Designer/DiagramExplorer';
import SourceControlPanel from '../SourceControl/SourceControlPanel';
import VariablePanel from '../Debugger/VariablePanel';
import BreakpointPanel from '../Debugger/BreakpointPanel';
import { ExecutionHistory } from '../Debugger/ExecutionHistory';
import ExecutionTimeline from '../Debugger/ExecutionTimeline';
import PanelErrorBoundary from '../Common/PanelErrorBoundary';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDebuggerStore } from '../../stores/debuggerStore';

interface ActivityPaletteSidebarProps {
  width: number;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
}

type DebugTab = 'variables' | 'breakpoints' | 'execution' | 'execution-history';
type DesignerTab = 'activities' | 'diagrams' | 'sourceControl';
type ExecutionTab = 'timeline' | 'history';

function handleTabKeyDown<T extends string>(
  event: React.KeyboardEvent<HTMLButtonElement>,
  tabs: readonly T[],
  currentTab: T,
  setTab: (tab: T) => void,
) {
  const currentIndex = tabs.indexOf(currentTab);
  let nextIndex: number | null = null;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  const nextTab = tabs[nextIndex];
  setTab(nextTab);
  event.currentTarget.parentElement
    ?.querySelector<HTMLButtonElement>(`[data-tab-key="${nextTab}"]`)
    ?.focus();
}

const ActivityPaletteSidebar: React.FC<ActivityPaletteSidebarProps> = React.memo(({
  width,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const { t } = useTranslation('common');
  const [debugTab, setDebugTab] = useState<DebugTab>('variables');
  const [designerTab, setDesignerTab] = useState<DesignerTab>('activities');
  const [executionTab, setExecutionTab] = useState<ExecutionTab>('timeline');
  const activeDebugTab: Exclude<DebugTab, 'execution-history'> = debugTab === 'execution-history' ? 'execution' : debugTab;
  const debugTabs = ['variables', 'breakpoints', 'execution'] as const;
  const designerTabs = ['activities', 'diagrams', 'sourceControl'] as const;
  const executionTabs = ['timeline', 'history'] as const;
  const selectDebugTab = (tab: Exclude<DebugTab, 'execution-history'>) => {
    if (tab === 'execution') setExecutionTab('timeline');
    setDebugTab(tab);
  };
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId);
  const setActiveDiagram = useDiagramStore((s) => s.setActiveDiagram);
  const { isDebugging, isPaused, isStepLoading } = useDebuggerStore(
    useShallow((s) => ({
      isDebugging: s.isDebugging,
      isPaused: s.isPaused,
      isStepLoading: s.isStepLoading,
    }))
  );

  return (
    <aside style={{ width }} className="bg-ui-surface-raised overflow-hidden flex-shrink-0" data-tour="activity-palette">
      <div className="h-full flex flex-col">
        <div className={`h-full flex flex-col overflow-hidden ${isDebugging ? '' : 'hidden'}`}>
          <div className="p-3 border-b border-ui-border flex-shrink-0">
            <h2 className="font-semibold mb-2">{t('sidebar.debugControls')}</h2>
            <div className="space-y-1">
              <button className="w-full px-3 py-1.5 bg-ui-secondary text-ui-text-inverse rounded text-sm hover:bg-ui-secondary-hover flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isPaused || isStepLoading} onClick={onStepOver}>
                <FiSkipForward className="w-4 h-4" />{t('toolbar.stepOver')}
              </button>
              <button className="w-full px-3 py-1.5 bg-ui-secondary text-ui-text-inverse rounded text-sm hover:bg-ui-secondary-hover flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isPaused || isStepLoading} onClick={onStepInto}>
                <FiChevronDown className="w-4 h-4" />{t('toolbar.stepInto')}
              </button>
              <button className="w-full px-3 py-1.5 bg-ui-secondary text-ui-text-inverse rounded text-sm hover:bg-ui-secondary-hover flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isPaused || isStepLoading} onClick={onStepOut}>
                <FiChevronUp className="w-4 h-4" />{t('toolbar.stepOut')}
              </button>
            </div>
          </div>
          <div className="flex border-b border-ui-border flex-shrink-0" role="tablist" aria-label={t('sidebar.debugControls')}>
            <button
              id="debug-tab-variables"
              data-tab-key="variables"
              type="button"
              role="tab"
              aria-selected={activeDebugTab === 'variables'}
              aria-controls="debug-tabpanel"
              tabIndex={activeDebugTab === 'variables' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${activeDebugTab === 'variables' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDebugTab('variables')}
              onKeyDown={(event) => handleTabKeyDown(event, debugTabs, activeDebugTab, setDebugTab)}
            >{t('sidebar.variables')}</button>
            <button
              id="debug-tab-breakpoints"
              data-tab-key="breakpoints"
              type="button"
              role="tab"
              aria-selected={activeDebugTab === 'breakpoints'}
              aria-controls="debug-tabpanel"
              tabIndex={activeDebugTab === 'breakpoints' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${activeDebugTab === 'breakpoints' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDebugTab('breakpoints')}
              onKeyDown={(event) => handleTabKeyDown(event, debugTabs, activeDebugTab, setDebugTab)}
            >{t('sidebar.breakpoints')}</button>
            <button
              id="debug-tab-execution"
              data-tab-key="execution"
              type="button"
              role="tab"
              aria-selected={activeDebugTab === 'execution'}
              aria-controls="debug-tabpanel"
              tabIndex={activeDebugTab === 'execution' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${activeDebugTab === 'execution' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => selectDebugTab('execution')}
              onKeyDown={(event) => handleTabKeyDown(event, debugTabs, activeDebugTab, selectDebugTab)}
            >{t('sidebar.execution')}</button>
          </div>
          <div
            id="debug-tabpanel"
            role="tabpanel"
            aria-labelledby={`debug-tab-${activeDebugTab}`}
            tabIndex={0}
            className="flex-1 overflow-hidden min-h-0"
          >
            {debugTab === 'variables' ? (
              <PanelErrorBoundary panelName="VariablePanel">
                <VariablePanel />
              </PanelErrorBoundary>
            ) : debugTab === 'breakpoints' ? (
              <PanelErrorBoundary panelName="BreakpointPanel">
                <BreakpointPanel />
              </PanelErrorBoundary>
            ) : (
              <PanelErrorBoundary panelName="ExecutionHistory">
                {debugTab === 'execution' || debugTab === 'execution-history' ? (
                <div className="h-full flex flex-col">
                  <div className="flex border-b border-ui-border" role="tablist" aria-label={t('sidebar.execution')}>
                    <button
                      id="debug-execution-tab-timeline"
                      data-tab-key="timeline"
                      role="tab"
                      aria-selected={executionTab === 'timeline'}
                      aria-controls="debug-execution-tabpanel"
                      tabIndex={executionTab === 'timeline' ? 0 : -1}
                      className={`flex-1 px-2 py-1 text-xs font-medium ${executionTab === 'timeline' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
                      type="button"
                      onClick={() => { setExecutionTab('timeline'); setDebugTab('execution'); }}
                      onKeyDown={(event) => handleTabKeyDown(event, executionTabs, executionTab, (tab) => { setExecutionTab(tab); setDebugTab(tab === 'history' ? 'execution-history' : 'execution'); })}
                    >
                      {t('sidebar.timeline')}
                    </button>
                    <button
                      id="debug-execution-tab-history"
                      data-tab-key="history"
                      role="tab"
                      aria-selected={executionTab === 'history'}
                      aria-controls="debug-execution-tabpanel"
                      tabIndex={executionTab === 'history' ? 0 : -1}
                      className={`flex-1 px-2 py-1 text-xs font-medium ${executionTab === 'history' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
                      type="button"
                      onClick={() => { setExecutionTab('history'); setDebugTab('execution-history'); }}
                      onKeyDown={(event) => handleTabKeyDown(event, executionTabs, executionTab, (tab) => { setExecutionTab(tab); setDebugTab(tab === 'history' ? 'execution-history' : 'execution'); })}
                    >
                      {t('status.history')}
                    </button>
                  </div>
                  <div id="debug-execution-tabpanel" role="tabpanel" aria-labelledby={`debug-execution-tab-${executionTab}`} tabIndex={0} className="flex-1 min-h-0">
                    {executionTab === 'timeline' ? <ExecutionTimeline /> : <ExecutionHistory />}
                  </div>
                </div>
                ) : null}
              </PanelErrorBoundary>
            )}
          </div>
        </div>
        <div className={`h-full flex flex-col ${isDebugging ? 'hidden' : ''}`}>
          <div className="flex border-b border-ui-border" role="tablist" aria-label={t('sidebar.activities')}>
            <button
              id="designer-tab-activities"
              data-tab-key="activities"
              type="button"
              role="tab"
              aria-selected={designerTab === 'activities'}
              aria-controls="designer-tabpanel"
              tabIndex={designerTab === 'activities' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${designerTab === 'activities' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDesignerTab('activities')}
              onKeyDown={(event) => handleTabKeyDown(event, designerTabs, designerTab, setDesignerTab)}
            >
              {t('sidebar.activities')}
            </button>
            <button
              id="designer-tab-diagrams"
              data-tab-key="diagrams"
              type="button"
              role="tab"
              aria-selected={designerTab === 'diagrams'}
              aria-controls="designer-tabpanel"
              tabIndex={designerTab === 'diagrams' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${designerTab === 'diagrams' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDesignerTab('diagrams')}
              onKeyDown={(event) => handleTabKeyDown(event, designerTabs, designerTab, setDesignerTab)}
            >
              {t('sidebar.diagrams')}
            </button>
            <button
              id="designer-tab-sourceControl"
              data-tab-key="sourceControl"
              type="button"
              role="tab"
              aria-selected={designerTab === 'sourceControl'}
              aria-controls="designer-tabpanel"
              tabIndex={designerTab === 'sourceControl' ? 0 : -1}
              className={`flex-1 px-3 py-2 text-sm font-medium ${designerTab === 'sourceControl' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDesignerTab('sourceControl')}
              onKeyDown={(event) => handleTabKeyDown(event, designerTabs, designerTab, setDesignerTab)}
            >
              {t('sidebar.sourceControl')}
            </button>
          </div>
          <div
            id="designer-tabpanel"
            role="tabpanel"
            aria-labelledby={`designer-tab-${designerTab}`}
            tabIndex={0}
            className="flex-1 overflow-hidden"
          >
            {designerTab === 'activities' ? (
              <PanelErrorBoundary panelName="ActivityPalette">
                <ActivityPalette />
              </PanelErrorBoundary>
            ) : designerTab === 'diagrams' ? (
              <PanelErrorBoundary panelName="DiagramExplorer">
                <DiagramExplorer onSelectDiagram={setActiveDiagram} activeDiagramId={activeDiagramId} />
              </PanelErrorBoundary>
            ) : (
              <PanelErrorBoundary panelName="SourceControlPanel">
                <SourceControlPanel />
              </PanelErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
});

ActivityPaletteSidebar.displayName = 'ActivityPaletteSidebar';

export default ActivityPaletteSidebar;
