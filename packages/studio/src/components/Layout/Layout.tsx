import React, { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useBlockStore } from '../../stores/blockStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useConsoleStore } from '../../stores/consoleStore';
import { useFileStore } from '../../stores/fileStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { useUIStore } from '../../stores/uiStore';
import { useEngine } from '../../hooks/useEngine';
import { useAutoSave } from '../../hooks/useAutoSave';
import { validateProjectDiagramState } from '../../utils/diagramValidation';
import { config } from '../../config/app.config';
import Toolbar from './Toolbar';
import SidebarLeft from './SidebarLeft';
import SidebarRight from './SidebarRight';
import MainContent from './MainContent';
import StatusBar from './StatusBar';
import CodeModal from './CodeModal';
import { LoadingOverlay } from '../Common/Loading';

type Tab = 'designer' | 'debugger' | 'console';

const Layout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('designer');
  const [showConsole, setShowConsole] = useState(config.console.defaultOpen);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string> | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const initialLoadComplete = useRef(false);
  const prevDiagramRef = useRef<string>('');

  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const executionState = useExecutionStore((state) => state.executionState);
  const executionSpeed = useExecutionStore((state) => state.executionSpeed);
  const setExecutionSpeed = useExecutionStore((state) => state.setExecutionSpeed);
  const metadata = useProcessMetadataStore((state) => state.metadata);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const projectPath = useProjectFsStore((state) => state.projectPath);
  const { isPaused, isStepLoading, setCallStack, setVariables, setStepLoading } = useDebuggerStore();
  const addConsoleLog = useConsoleStore((state) => state.addLog);
  const { markDirty, isDirty } = useFileStore();
  const {
    isConnected,
    isRunning,
    bridgeState,
    capabilities,
    connect,
    runProcess,
    stopProcess,
    pauseProcess,
    resumeProcess,
    generateCode,
    stepOver,
    stepInto,
    stepOut,
    getVariables,
    getCallStack,
    syncBreakpoints,
  } = useEngine();

  const { loading, loadingMessage, setLoading, setLoadingMessage } = useUIStore();

  useAutoSave({
    enabled: config.autosave.enabled,
    intervalMs: config.autosave.intervalMs,
  });

  useEffect(() => {
    if (!isConnected) {
      connect().catch((err) => {
        addConsoleLog({
          level: 'warn',
          message:
            err instanceof Error
              ? `Auto-connect failed: ${err.message}`
              : 'Auto-connect failed',
          source: 'layout',
        });
        toast.error('Bridge connection failed', {
          description:
            err instanceof Error ? err.message : 'Unable to connect to Python engine',
        });
      });
    }
  }, [addConsoleLog, connect, isConnected]);

  useEffect(() => {
    if (!metadata || nodes.length === 0) {
      return;
    }

    const currentDiagram = JSON.stringify({ nodes: nodes.length, edges: edges.length, metadataId: metadata.id });

    if (!initialLoadComplete.current) {
      prevDiagramRef.current = currentDiagram;
      initialLoadComplete.current = true;
      return;
    }

    if (currentDiagram !== prevDiagramRef.current && !isDirty) {
      markDirty(true);
    }

    prevDiagramRef.current = currentDiagram;
  }, [nodes, edges, metadata, isDirty, markDirty]);

  const generateRobotSource = useCallback(async (): Promise<{ code: string; sourcemap?: Record<number, string>; files?: Record<string, string> }> => {
    const validationErrors =
      activeDiagramId && project
        ? validateProjectDiagramState(activeDiagramId, project.diagrams, diagramDocuments)
        : [];

    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0].message);
    }

    const subDiagrams: Record<string, unknown> = {};
    if (project) {
      for (const diag of project.diagrams) {
        if (diag.type === 'sub-diagram' && diagramDocuments[diag.id]) {
          subDiagrams[diag.id] = {
            metadata: diagramDocuments[diag.id].metadata,
            nodes: diagramDocuments[diag.id].nodes,
            edges: diagramDocuments[diag.id].edges,
          };
        }
      }
    }

    const result = await generateCode({
      nodes,
      edges,
      metadata,
      project,
      activeDiagramId,
      diagramDocuments,
      subDiagrams,
    });
    if (!result.code) {
      throw new Error('Failed to generate Python code');
    }
    return result;
  }, [activeDiagramId, diagramDocuments, generateCode, metadata, nodes, edges, project]);

  const handleRun = useCallback(async () => {
    try {
      setLoading('execute', true);
      setLoadingMessage('Starting process...');
      
      if (!isConnected) {
        await connect();
      }
      
      if (metadata) {
        const { code, sourcemap } = await generateRobotSource();
        
        const sourcemapNodeIds = sourcemap ? new Set<string>(Object.values(sourcemap)) : new Set<string>();
        
        await syncBreakpoints(sourcemapNodeIds);
        
        await runProcess(code, metadata.name, sourcemap);
        toast.success('Process started', { description: metadata.name });
      } else {
        toast.warning('No process metadata', {
          description: 'Please create or load a process first.',
        });
      }
    } catch (err) {
      addConsoleLog({
        level: 'error',
        message:
          err instanceof Error ? `Execution failed: ${err.message}` : 'Execution failed',
        source: 'layout',
      });
      toast.error('Execution failed', {
        description: err instanceof Error ? err.message : 'Failed to run process.',
      });
    } finally {
      setLoading('execute', false);
      setLoadingMessage(null);
    }
  }, [addConsoleLog, connect, generateRobotSource, isConnected, metadata, runProcess, syncBreakpoints, setLoading, setLoadingMessage]);

  const handleStop = useCallback(async () => {
    await stopProcess();
  }, [stopProcess]);

  const handlePause = useCallback(async () => {
    await pauseProcess();
  }, [pauseProcess]);

  const handleResume = useCallback(async () => {
    await resumeProcess();
  }, [resumeProcess]);

  const refreshDebuggerState = useCallback(async () => {
    try {
      const vars = await getVariables() as Array<{ name: string; value: unknown; type: string }>;
      if (vars) {
        setVariables(vars.map(v => ({
          name: v.name,
          value: v.value,
          type: v.type || 'unknown',
          children: [],
        })));
      }

      const stack = await getCallStack() as Array<{ activity: string; library: string; line: number; nodeId: string }>;
      if (stack) {
        setCallStack(stack);
      }
    } catch (err) {
      addConsoleLog({
        level: 'warn',
        message:
          err instanceof Error
            ? `Failed to refresh debugger state: ${err.message}`
            : 'Failed to refresh debugger state',
        source: 'layout',
      });
    }
  }, [addConsoleLog, getVariables, getCallStack, setVariables, setCallStack]);

  const handleStepOver = useCallback(async () => {
    if (isStepLoading) return;
    try {
      setStepLoading(true);
      await stepOver();
      await refreshDebuggerState();
    } catch (err) {
      toast.error('Step over failed', {
        description: err instanceof Error ? err.message : 'Unable to step over',
      });
    } finally {
      setStepLoading(false);
    }
  }, [stepOver, refreshDebuggerState, isStepLoading, setStepLoading]);

  const handleStepInto = useCallback(async () => {
    if (isStepLoading) return;
    try {
      setStepLoading(true);
      await stepInto();
      await refreshDebuggerState();
    } catch (err) {
      toast.error('Step into failed', {
        description: err instanceof Error ? err.message : 'Unable to step into',
      });
    } finally {
      setStepLoading(false);
    }
  }, [stepInto, refreshDebuggerState, isStepLoading, setStepLoading]);

  const handleStepOut = useCallback(async () => {
    if (isStepLoading) return;
    try {
      setStepLoading(true);
      await stepOut();
      await refreshDebuggerState();
    } catch (err) {
      toast.error('Step out failed', {
        description: err instanceof Error ? err.message : 'Unable to step out',
      });
    } finally {
      setStepLoading(false);
    }
  }, [stepOut, refreshDebuggerState, isStepLoading, setStepLoading]);

  const handleExportCode = useCallback(async () => {
    try {
      if (!isConnected) {
        await connect();
      }

      const { code, files } = await generateRobotSource();
      setGeneratedCode(code);
      setGeneratedFiles(files || null);
      setShowCodeModal(true);
    } catch (err) {
      addConsoleLog({
        level: 'error',
        message:
          err instanceof Error
            ? `Code generation failed: ${err.message}`
            : 'Code generation failed',
        source: 'layout',
      });
      toast.error('Code generation failed', {
        description: err instanceof Error ? err.message : 'Unable to generate code',
      });
    }
  }, [addConsoleLog, connect, generateRobotSource, isConnected]);

  const handleDownloadCode = useCallback(() => {
    if (generatedFiles && Object.keys(generatedFiles).length > 0) {
      Object.entries(generatedFiles).forEach(([path, content]) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.replace(/[\\/]/g, '__');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
      return;
    }

    if (generatedCode) {
      const blob = new Blob([generatedCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${metadata?.name || 'process'}.py`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [generatedCode, generatedFiles, metadata]);

  const handleCloseCodeModal = useCallback(() => {
    setShowCodeModal(false);
    setGeneratedFiles(null);
  }, []);

  const handleToggleConsole = useCallback(() => {
    setShowConsole(prev => !prev);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <Toolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isConnected={isConnected}
        bridgeState={bridgeState}
        isRunning={isRunning}
        isPaused={isPaused}
        isStepLoading={isStepLoading}
        hasMetadata={!!metadata}
        hasNodes={nodes.length > 0}
        executionSpeed={executionSpeed}
        projectName={project?.name}
        projectPath={projectPath ?? undefined}
        onRun={handleRun}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onExportCode={handleExportCode}
        onSpeedChange={setExecutionSpeed}
        onStepOver={handleStepOver}
        onStepInto={handleStepInto}
        onStepOut={handleStepOut}
      />

      <div className="flex-1 flex overflow-hidden">
        <SidebarLeft
          activeTab={activeTab}
          isPaused={isPaused}
          isStepLoading={isStepLoading}
          onStepOver={handleStepOver}
          onStepInto={handleStepInto}
          onStepOut={handleStepOut}
        />

        <MainContent activeTab={activeTab} showConsole={showConsole} />

        <SidebarRight activeTab={activeTab} />
      </div>

      <StatusBar
        activeTab={activeTab}
        bridgeState={bridgeState}
        capabilities={capabilities}
        executionState={executionState}
        executionSpeed={executionSpeed}
        metadata={metadata}
        showConsole={showConsole}
        onToggleConsole={handleToggleConsole}
      />

      <CodeModal
        isOpen={showCodeModal}
        code={generatedCode}
        files={generatedFiles}
        fileCount={generatedFiles ? Object.keys(generatedFiles).length : 0}
        onClose={handleCloseCodeModal}
        onDownload={handleDownloadCode}
      />

      <LoadingOverlay isVisible={loading.execute} message={loadingMessage || 'Executing...'} />
    </div>
  );
};

export default Layout;
