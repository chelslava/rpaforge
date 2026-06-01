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
import VariablePanel from '../Debugger/VariablePanel';
import BreakpointPanel from '../Debugger/BreakpointPanel';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDebuggerStore } from '../../stores/debuggerStore';

interface ActivityPaletteSidebarProps {
  width: number;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
}

const ActivityPaletteSidebar: React.FC<ActivityPaletteSidebarProps> = React.memo(({
  width,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const { t } = useTranslation('common');
  const [debugTab, setDebugTab] = useState<'variables' | 'breakpoints'>('variables');
  const [designerTab, setDesignerTab] = useState<'activities' | 'diagrams'>('activities');
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
          <div className="flex border-b border-ui-border flex-shrink-0">
            <button className={`flex-1 px-3 py-2 text-sm font-medium ${debugTab === 'variables' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`} onClick={() => setDebugTab('variables')}>{t('sidebar.variables')}</button>
            <button className={`flex-1 px-3 py-2 text-sm font-medium ${debugTab === 'breakpoints' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`} onClick={() => setDebugTab('breakpoints')}>{t('sidebar.breakpoints')}</button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            {debugTab === 'variables' ? <VariablePanel /> : <BreakpointPanel />}
          </div>
        </div>
        <div className={`h-full flex flex-col ${isDebugging ? 'hidden' : ''}`}>
          <div className="flex border-b border-ui-border">
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${designerTab === 'activities' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDesignerTab('activities')}
            >
              {t('sidebar.activities')}
            </button>
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${designerTab === 'diagrams' ? 'bg-ui-surface text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
              onClick={() => setDesignerTab('diagrams')}
            >
              {t('sidebar.diagrams')}
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {designerTab === 'activities' ? (
              <ActivityPalette />
            ) : (
              <DiagramExplorer onSelectDiagram={setActiveDiagram} activeDiagramId={activeDiagramId} />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
});

ActivityPaletteSidebar.displayName = 'ActivityPaletteSidebar';

export default ActivityPaletteSidebar;
