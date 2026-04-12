import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useFileStore } from '../../stores/fileStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useEngine } from '../../hooks/useEngine';
import { useAutoSave } from '../../hooks/useAutoSave';
import { generateClientRobotCode } from '../../utils/clientCodegen';
import { validateProjectDiagramState } from '../../utils/diagramValidation';
import { config } from '../../config/app.config';
import Toolbar from './Toolbar';
import SidebarLeft from './SidebarLeft';
import SidebarRight from './SidebarRight';
import MainContent from './MainContent';
import StatusBar from './StatusBar';
import CodeModal from './CodeModal';

type Tab = 'designer' | 'debugger' | 'console' | 'preview';

const Layout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('designer');
  const [showConsole, setShowConsole] = useState(true);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string> | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const initialLoadComplete = useRef(false);
  const prevDiagramRef = useRef<string>('');

  const { executionState, metadata, nodes, edges } = useProcessStore();
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const { isPaused, isStepLoading, setCallStack, setVariables, setStepLoading } = useDebuggerStore();
  const { markDirty, isDirty } = useFileStore();
  const {
    isConnected,
    isRunning,
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

  useAutoSave({
    enabled: config.autosave.enabled,
    intervalMs: config.autosave.intervalMs,
  });

  useEffect(() => {
    if (!isConnected) {
      connect().catch((err) => {
        console.warn('[Layout] Auto-connect failed:', err);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    const result = await generateCode({
      nodes,
      edges,
      metadata,
      project,
      activeDiagramId,
      diagramDocuments,
    });
    if (!result.code) {
      throw new Error('Failed to generate Robot Framework code');
    }
    return result;
  }, [activeDiagramId, diagramDocuments, generateCode, metadata, nodes, edges, project]);

  const handleRun = useCallback(async () => {
    console.log('[handleRun] Starting execution, metadata:', metadata, 'isConnected:', isConnected);
    try {
      if (!isConnected) {
        console.log('[handleRun] Not connected, connecting...');
        await connect();
      }
      
      if (metadata) {
        console.log('[handleRun] Generating Robot Framework source...');
      const { code, sourcemap } = await generateRobotSource();
        console.log('[handleRun] Generated source (first 300 chars):', code.substring(0, 300));
        console.log('[handleRun] Sourcemap entries:', sourcemap ? Object.keys(sourcemap).length : 0);
        
        // Sync breakpoints using node IDs from sourcemap (actual nodes in generated code)
        const sourcemapNodeIds = sourcemap ? new Set<string>(Object.values(sourcemap)) : new Set<string>();
        console.log('[handleRun] Sourcemap node IDs:', Array.from(sourcemapNodeIds));
        console.log('[handleRun] Current node IDs:', nodes.map(n => n.id));
        
        // Cleanup stale breakpoints and sync with Python
        await syncBreakpoints(sourcemapNodeIds);
        
        console.log('[handleRun] Calling runProcess with name:', metadata.name);
        await runProcess(code, metadata.name, sourcemap);
        console.log('[handleRun] runProcess completed successfully');
      } else {
        console.warn('[handleRun] No metadata available - cannot run process');
        alert('No process metadata. Please create or load a process first.');
      }
    } catch (err) {
      console.error('[handleRun] Execution failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to run process.');
    }
  }, [isConnected, connect, metadata, generateRobotSource, runProcess, syncBreakpoints, nodes]);

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

      const stack = await getCallStack() as Array<{ keyword: string; file: string; line: number; args: unknown[] }>;
      if (stack) {
        setCallStack(stack);
      }
    } catch (err) {
      console.warn('[Layout] Failed to refresh debugger state:', err);
    }
  }, [getVariables, getCallStack, setVariables, setCallStack]);

  const handleStepOver = useCallback(async () => {
    if (isStepLoading) return;
    try {
      setStepLoading(true);
      await stepOver();
      await refreshDebuggerState();
    } catch (err) {
      console.error('Step over failed:', err);
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
      console.error('Step into failed:', err);
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
      console.error('Step out failed:', err);
    } finally {
      setStepLoading(false);
    }
  }, [stepOut, refreshDebuggerState, isStepLoading, setStepLoading]);

  const generateClientSideCode = useCallback((): string => {
    return generateClientRobotCode({
      nodes,
      edges,
      metadata,
      project,
      activeDiagramId,
      diagramDocuments,
    });
  }, [activeDiagramId, diagramDocuments, edges, metadata, nodes, project]);

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
      console.error('Failed to generate code via bridge:', err);
      setGeneratedCode(generateClientSideCode());
      setGeneratedFiles(null);
      setShowCodeModal(true);
    }
  }, [connect, generateClientSideCode, generateRobotSource, isConnected]);

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
      a.download = `${metadata?.name || 'process'}.robot`;
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
        isRunning={isRunning}
        isPaused={isPaused}
        isStepLoading={isStepLoading}
        hasMetadata={!!metadata}
        hasNodes={nodes.length > 0}
        onRun={handleRun}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onExportCode={handleExportCode}
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
        executionState={executionState}
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
    </div>
  );
};

export default Layout;
