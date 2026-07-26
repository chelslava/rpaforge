import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import ActivityPaletteSidebar from './ActivityPaletteSidebar';

let isDebugging = false;

vi.mock('../../stores/diagramStore', () => ({
  useDiagramStore: (selector: (state: { activeDiagramId: null; setActiveDiagram: () => void }) => unknown) => selector({
    activeDiagramId: null,
    setActiveDiagram: vi.fn(),
  }),
}));

vi.mock('../../stores/debuggerStore', () => ({
  useDebuggerStore: (selector: (state: { isDebugging: boolean; isPaused: boolean; isStepLoading: boolean }) => unknown) => selector({
    isDebugging,
    isPaused: false,
    isStepLoading: false,
  }),
}));

vi.mock('../Designer/ActivityPalette', () => ({ default: () => <div>Activity Palette</div> }));
vi.mock('../Designer/DiagramExplorer', () => ({ default: () => <div>Diagram Explorer</div> }));
vi.mock('../SourceControl/SourceControlPanel', () => ({ default: () => <div>Source Control</div> }));
vi.mock('../Recorder', () => ({ default: () => <div>Recorder</div> }));
vi.mock('../Debugger/VariablePanel', () => ({ default: () => <div>Variables</div> }));
vi.mock('../Debugger/BreakpointPanel', () => ({ default: () => <div>Breakpoints</div> }));
vi.mock('../Debugger/ExecutionHistory', () => ({ ExecutionHistory: () => <div>Execution History</div> }));
vi.mock('../Debugger/ExecutionTimeline', () => ({ default: () => <div>Execution Timeline</div> }));
vi.mock('../Common/PanelErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderSidebar = () => render(
  <ActivityPaletteSidebar
    width={240}
    onStepOver={vi.fn()}
    onStepInto={vi.fn()}
    onStepOut={vi.fn()}
  />,
);

describe('ActivityPaletteSidebar accessibility', () => {
  beforeEach(() => {
    isDebugging = false;
  });

  test('provides roving keyboard navigation for designer tabs', () => {
    renderSidebar();

    const tablist = screen.getByRole('tablist', { name: 'sidebar.activities' });
    const activitiesTab = screen.getByRole('tab', { name: 'sidebar.activities' });
    const diagramsTab = screen.getByRole('tab', { name: 'sidebar.diagrams' });
    const panel = document.getElementById('designer-tabpanel') as HTMLElement;

    expect(activitiesTab).toHaveAttribute('aria-selected', 'true');
    expect(activitiesTab).toHaveAttribute('aria-controls', 'designer-tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'designer-tab-activities');

    activitiesTab.focus();
    fireEvent.keyDown(activitiesTab, { key: 'ArrowRight' });

    expect(diagramsTab).toHaveFocus();
    expect(diagramsTab).toHaveAttribute('aria-selected', 'true');
    expect(panel).toHaveAttribute('aria-labelledby', 'designer-tab-diagrams');
    expect(tablist).toHaveAttribute('role', 'tablist');
  });

  test('provides roving keyboard navigation for debugger and execution tabs', () => {
    isDebugging = true;
    renderSidebar();

    const debugTablist = screen.getByRole('tablist', { name: 'sidebar.debugControls' });
    const variablesTab = screen.getByRole('tab', { name: 'sidebar.variables' });
    const executionTab = screen.getByRole('tab', { name: 'sidebar.execution' });

    variablesTab.focus();
    fireEvent.keyDown(variablesTab, { key: 'End' });

    expect(executionTab).toHaveFocus();
    expect(executionTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tablist', { name: 'sidebar.execution' })).toBeInTheDocument();

    const timelineTab = screen.getByRole('tab', { name: 'sidebar.timeline' });
    const historyTab = screen.getByRole('tab', { name: 'History' });
    timelineTab.focus();
    fireEvent.keyDown(timelineTab, { key: 'ArrowRight' });

    expect(historyTab).toHaveFocus();
    expect(debugTablist).toHaveAttribute('role', 'tablist');
    expect(screen.getByRole('tabpanel', { name: 'History' })).toBeInTheDocument();
  });
});
