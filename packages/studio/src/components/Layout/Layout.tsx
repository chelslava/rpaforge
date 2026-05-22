import React, { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useBlockStore } from '../../stores/blockStore';
import { useSettingsStore } from '../../stores/settingsStore';
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
import i18n from '../../i18n';
import { validateProjectDiagramState } from '../../utils/diagramValidation';
import { config } from '../../config/app.config';
import MainToolbar from './MainToolbar';
import ActivityPaletteSidebar from './ActivityPaletteSidebar';
import PropertiesSidebar from './PropertiesSidebar';
import MainContent from './MainContent';
import StatusBar from './StatusBar';
import CodeModal from './CodeModal';
import { LoadingOverlay } from '../Common/Loading';
import { MermaidPreview } from '../Common/MermaidPreview';
import HelpDialog from '../Common/HelpDialog';
import { WelcomeScreen } from '../Common/WelcomeScreen';
import { OnboardingTour } from '../Common/OnboardingTour';

const Layout: React.FC = () => {
  const { t } = useTranslation('common');
  const [showConsole, setShowConsole] = useState(config.console.defaultOpen);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string> | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showMermaidPreview, setShowMermaidPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('rpaforge_welcomed'));
  const initialLoadComplete = useRef(false);
  const prevDiagramRef = useRef<string>('');

  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const executionState = useExecutionStore((state) => state.executionState);
  const executionSpeed = useExecutionStore((state) => state.executionSpeed);
  const setExecutionSpeed = useExecutionStore((state) => state.setExecutionSpeed);
  const executionProgress = useExecutionStore((state) => state.executionProgress);
  const metadata = useProcessMetadataStore((state) => state.metadata);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const projectPath = useProjectFsStore((state) => state.projectPath);
  const { isPaused, isStepLoading, isDebugging, setDebugging, setCallStack, setVariables, setStepLoading } = useDebuggerStore();
  const addConsoleLog = useConsoleStore((state) => state.addLog);
  const { markDirty, isDirty } = useFileStore();
  const {
    isConnected,
    isRunning,
    bridgeState,
    bridgeStatus,
    capabilities,
    connect,
    runDiagram,
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

  const { newProject, openProjectFolder } = useFileOperations();

  const handleOpenProject = useCallback(async () => {
    setLoading('open', true);
    setLoadingMessage(t('layout.opening'));
    try {
      await openProjectFolder();
    } finally {
      setLoading('open', false);
      setLoadingMessage(null);
    }
  }, [openProjectFolder, setLoading, setLoadingMessage, t]);

  useAutoSave({
    enabled: config.autosave.enabled,
    intervalMs: config.autosave.intervalMs,
  });

  useEffect(() => {
    if (executionState === 'idle' || executionState === 'stopped') {
      setDebugging(false);
    }
  }, [executionState, setDebugging]);

  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); setShowHelp(true); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!isConnected) {
      connect().catch((err) => {
        addConsoleLog({
          level: 'warn',
          message:
            err instanceof Error
              ? `${t('execution.autoConnectFailed')}: ${err.message}`
              : t('execution.autoConnectFailed'),
          source: 'layout',
        });
        toast.error(t('execution.bridgeConnectionFailed'), {
          description:
            err instanceof Error ? err.message : t('execution.unableToConnect'),
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

  const handleRun = useCallback(async (mode: 'run' | 'debug') => {
    try {
      setLoading('execute', true);
      setLoadingMessage(t(mode === 'debug' ? 'execution.startingDebug' : 'execution.startingProcess'));
      if (!isConnected) await connect();
      if (metadata && nodes.length > 0) {
        const hasEndBlock = nodes.some(n => n.data?.blockData?.type === 'end');
        if (!hasEndBlock) toast.warning(t('execution.noEndBlock'));
        setDebugging(mode === 'debug');
        if (mode === 'debug') {
          const allNodeIds = new Set(nodes.map(n => n.id));
          await syncBreakpoints(allNodeIds);
        } else {
          await syncBreakpoints(undefined, true);
        }
        await runDiagram({ nodes, edges, metadata });
        toast.success(t(mode === 'debug' ? 'execution.debugStarted' : 'execution.processStarted'), { description: metadata.name });
      } else {
        toast.warning(t('execution.noProcessMetadata'), { description: t('execution.createOrLoadFirst') });
      }
    } catch (err) {
      addConsoleLog({ level: 'error', message: err instanceof Error ? `${t('execution.executionFailed')}: ${err.message}` : t('execution.executionFailed'), source: 'layout' });
      toast.error(t('execution.executionFailed'), { description: err instanceof Error ? err.message : t('execution.failedToRun') });
    } finally {
      setLoading('execute', false);
      setLoadingMessage(null);
    }
  }, [addConsoleLog, connect, isConnected, metadata, nodes, edges, runDiagram, syncBreakpoints, setLoading, setLoadingMessage, setDebugging, t]);

  const handleDebug = useCallback(() => handleRun('debug'), [handleRun]);
  const handlePlay = useCallback(() => handleRun('run'), [handleRun]);

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
      const varsResult = await getVariables() as { variables?: Array<{ name: string; value: unknown; type: string }> };
      const vars = varsResult?.variables;
      if (vars) {
        setVariables(vars.map(v => ({
          name: v.name,
          value: v.value,
          type: v.type || 'unknown',
          children: [],
        })));
      }

      const stackResult = await getCallStack() as { callStack?: Array<{ activity: string; library: string; line: number; nodeId: string }> };
      const stack = stackResult?.callStack;
      if (stack) {
        setCallStack(stack);
      }
    } catch (err) {
      addConsoleLog({
        level: 'warn',
        message:
          err instanceof Error
            ? `${t('execution.refreshDebuggerFailed')}: ${err.message}`
            : t('execution.refreshDebuggerFailed'),
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
      toast.error(t('execution.stepOverFailed'), {
        description: err instanceof Error ? err.message : t('execution.unableToStepOver'),
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
      toast.error(t('execution.stepIntoFailed'), {
        description: err instanceof Error ? err.message : t('execution.unableToStepInto'),
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
      toast.error(t('execution.stepOutFailed'), {
        description: err instanceof Error ? err.message : t('execution.unableToStepOut'),
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
            ? `${t('execution.codeGenerationFailed')}: ${err.message}`
            : t('execution.codeGenerationFailed'),
        source: 'layout',
      });
      toast.error(t('execution.codeGenerationFailed'), {
        description: err instanceof Error ? err.message : t('execution.unableToGenerateCode'),
      });
    }
  }, [addConsoleLog, connect, generateRobotSource, isConnected]);

  const handleShowMermaid = useCallback(() => {
    setShowMermaidPreview(true);
  }, []);

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

  const [leftWidth, setLeftWidth] = useState(256);
  const [rightWidth, setRightWidth] = useState(288);
  const resizeState = useRef<{ type: 'left' | 'right' | null; startX: number; startWidth: number }>({ type: null, startX: 0, startWidth: 0 });

  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    resizeState.current = { type: 'left', startX: e.clientX, startWidth: leftWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [leftWidth]);

  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    resizeState.current = { type: 'right', startX: e.clientX, startWidth: rightWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [rightWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { type, startX, startWidth } = resizeState.current;
      if (type === 'left') {
        setLeftWidth(Math.max(160, Math.min(480, startWidth + e.clientX - startX)));
      } else if (type === 'right') {
        setRightWidth(Math.max(200, Math.min(600, startWidth - e.clientX + startX)));
      }
    };
    const handleMouseUp = () => {
      resizeState.current.type = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div key={language} className="h-screen flex flex-col overflow-hidden bg-ui-background text-ui-text">
      <MainToolbar
        isConnected={isConnected}
        bridgeState={bridgeState}
        isRunning={isRunning}
        isPaused={isPaused}
        isStepLoading={isStepLoading}
        isDebugging={isDebugging}
        hasMetadata={!!metadata}
        hasNodes={nodes.length > 0}
        executionSpeed={executionSpeed}
        projectName={project?.name}
        projectPath={projectPath ?? undefined}
        onPlay={handlePlay}
        onDebug={handleDebug}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onExportCode={handleExportCode}
        onShowMermaid={handleShowMermaid}
        onSpeedChange={setExecutionSpeed}
        onStepOver={handleStepOver}
        onStepInto={handleStepInto}
        onStepOut={handleStepOut}
      />

      <div className="flex-1 flex overflow-hidden">
        <ActivityPaletteSidebar
          width={leftWidth}
          isDebugging={isDebugging}
          isPaused={isPaused}
          isStepLoading={isStepLoading}
          onStepOver={handleStepOver}
          onStepInto={handleStepInto}
          onStepOut={handleStepOut}
        />

        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-ui-border hover:bg-ui-primary transition-colors"
          onMouseDown={handleLeftResizeStart}
        />

        <MainContent showConsole={showConsole} />

        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-ui-border hover:bg-ui-primary transition-colors"
          onMouseDown={handleRightResizeStart}
        />

        <PropertiesSidebar width={rightWidth} isDebugging={isDebugging} />
      </div>

      <StatusBar
        isDebugging={isDebugging}
        bridgeStatus={bridgeStatus}
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

      <MermaidPreview
        isOpen={showMermaidPreview}
        onClose={() => setShowMermaidPreview(false)}
        nodes={nodes}
        edges={edges}
        title={metadata?.name || t('layout.processDiagram')}
      />

      <LoadingOverlay isVisible={loading.execute || loading.open} message={loadingMessage || t('layout.executing')} progress={executionProgress > 0 ? executionProgress : undefined} />

      <HelpDialog open={showHelp} onClose={() => setShowHelp(false)} />

      {showWelcome && (
        <WelcomeScreen
          onNewProcess={() => newProject('New Project')}
          onOpenProcess={() => void handleOpenProject()}
          onDismiss={() => setShowWelcome(false)}
        />
      )}

      <OnboardingTour />
    </div>
  );
};

export default Layout;
