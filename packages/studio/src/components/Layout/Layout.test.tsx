import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import Layout from './Layout';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useFileStore } from '../../stores/fileStore';
import { useBlockStore } from '../../stores/blockStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { useExecutionStore } from '../../stores/executionStore';

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
  default: ({
    onRun,
    onExportCode,
  }: {
    onRun: () => void;
    onExportCode: () => void;
  }) => (
    <div>
      <button onClick={onRun}>Run Layout</button>
      <button onClick={onExportCode}>Export Layout</button>
    </div>
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
  default: ({
    isOpen,
    code,
  }: {
    isOpen: boolean;
    code: string | null;
  }) => (isOpen ? <div>CodeModal:{code}</div> : null),
}));

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useBlockStore.setState({
      nodes: [],
      edges: [],
    });

    useProcessMetadataStore.setState({
      mode: 'standalone',
      orchestratorUrl: null,
      isConnected: false,
      metadata: null,
      validationMessage: null,
    });

    useExecutionStore.setState({
      executionState: 'idle',
      executionProgress: 0,
      currentExecutingNodeId: null,
      executionSpeed: 1,
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

    useFileStore.setState({
      currentFile: null,
      recentFiles: [],
      isDirty: false,
      lastSaved: null,
    });

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
    render(<Layout />);

    fireEvent.click(screen.getByText('Run Layout'));

    expect(toastWarning).toHaveBeenCalledWith('No process metadata', {
      description: 'Please create or load a process first.',
    });
  });

  test('runs a process and syncs sourcemap node ids on success', async () => {
    useProcessMetadataStore.setState({
      metadata: {
        id: 'main',
        name: 'Main Process',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    useBlockStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'start',
          position: { x: 0, y: 0 },
          data: {
            blockData: {
              id: 'node-1',
              type: 'start',
              name: 'Start',
              label: 'Start',
              category: 'flow-control',
              processName: 'Main Process',
            },
            description: '',
            tags: [],
          },
        },
      ],
      edges: [],
    });

    const connect = vi.fn();
    const runProcess = vi.fn().mockResolvedValue({});
    const syncBreakpoints = vi.fn().mockResolvedValue(undefined);
    const generateCode = vi.fn().mockResolvedValue({
      code: '*** Tasks ***\nMain Process',
      sourcemap: { 2: 'node-1' },
    });

    useEngineMock.mockReturnValue({
      ...useEngineMock.mock.results[0]?.value,
      isConnected: true,
      connect,
      runProcess,
      syncBreakpoints,
      generateCode,
    });

    render(<Layout />);

    fireEvent.click(screen.getByText('Run Layout'));

    await vi.waitFor(() => {
      expect(syncBreakpoints).toHaveBeenCalledWith(new Set(['node-1']));
      expect(runProcess).toHaveBeenCalledWith(
        '*** Tasks ***\nMain Process',
        'Main Process',
        { 2: 'node-1' }
      );
    });

    expect(toastSuccess).toHaveBeenCalledWith('Process started', {
      description: 'Main Process',
    });
  });

  test('shows error toast for export failures', async () => {
    useProcessMetadataStore.setState({
      metadata: {
        id: 'main',
        name: 'Main Process',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    useBlockStore.setState({
      nodes: [],
      edges: [],
    });

    useEngineMock.mockReturnValue({
      ...useEngineMock.mock.results[0]?.value,
      generateCode: vi.fn().mockRejectedValue(new Error('bridge down')),
      connect: vi.fn(),
      isConnected: true,
    });

    render(<Layout />);

    await act(async () => {
      fireEvent.click(screen.getByText('Export Layout'));
    });

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Code generation failed', {
        description: 'bridge down',
      });
    });
  });
});
