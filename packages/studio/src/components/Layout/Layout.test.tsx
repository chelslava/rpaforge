import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Layout from './Layout';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useFileStore } from '../../stores/fileStore';
import { useProcessStore } from '../../stores/processStore';

const toastWarning = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const useEngineMock = vi.fn();

vi.mock('../../hooks/useEngine', () => ({
  useEngine: () => useEngineMock(),
}));

vi.mock('../../hooks/useAutoSave', () => ({
  useAutoSave: () => undefined,
}));

vi.mock('./Toolbar', () => ({
  default: ({ onRun }: { onRun: () => void }) => (
    <button onClick={onRun}>Run Layout</button>
  ),
}));

vi.mock('./SidebarLeft', () => ({
  default: () => <div>SidebarLeft</div>,
}));

vi.mock('./SidebarRight', () => ({
  default: () => <div>SidebarRight</div>,
}));

vi.mock('./MainContent', () => ({
  default: () => <div>MainContent</div>,
}));

vi.mock('./StatusBar', () => ({
  default: () => <div>StatusBar</div>,
}));

vi.mock('./CodeModal', () => ({
  default: () => null,
}));

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useProcessStore.persist.clearStorage();
    useProcessStore.setState({
      mode: 'standalone',
      orchestratorUrl: null,
      isConnected: false,
      metadata: null,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      validationMessage: null,
      executionState: 'idle',
      executionProgress: 0,
      currentExecutingNodeId: null,
      undoStack: [],
      redoStack: [],
      maxHistorySize: 50,
    });

    useDebuggerStore.setState({
      connectionState: 'disconnected',
      breakpoints: new Map(),
      fileBreakpoints: new Map(),
      variables: [],
      watchedVariables: new Set(),
      callStack: [],
      currentFile: null,
      currentLine: null,
      isPaused: false,
      isStepping: false,
      isStepLoading: false,
      lastBreakpointId: null,
    });

    useFileStore.persist.clearStorage();
    useFileStore.setState({
      currentFile: null,
      recentFiles: [],
      isDirty: false,
      lastSaved: null,
    });

    useDiagramStore.persist.clearStorage();
    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });

    useEngineMock.mockReturnValue({
      isConnected: true,
      bridgeState: 'ready',
      capabilities: null,
      isRunning: false,
      isPaused: false,
      error: null,
      lastResult: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      runProcess: vi.fn(),
      stopProcess: vi.fn(),
      pauseProcess: vi.fn(),
      resumeProcess: vi.fn(),
      getActivities: vi.fn(),
      generateCode: vi.fn(),
      setBreakpoint: vi.fn(),
      removeBreakpoint: vi.fn(),
      getBreakpoints: vi.fn(),
      getVariables: vi.fn(),
      getCallStack: vi.fn(),
      stepOver: vi.fn(),
      stepInto: vi.fn(),
      stepOut: vi.fn(),
      syncBreakpoints: vi.fn(),
    });
  });

  test('shows a toast instead of blocking alert when run is requested without metadata', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<Layout />);

    fireEvent.click(screen.getByText('Run Layout'));

    expect(toastWarning).toHaveBeenCalledWith('No process metadata', {
      description: 'Please create or load a process first.',
    });
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
