import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useBlockStore } from '../../stores/blockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useConsoleStore } from '../../stores/consoleStore';
import { useFileStore } from '../../stores/fileStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useVariableStore } from '../../stores/variableStore';
import { useUIStore } from '../../stores/uiStore';
import { useEngine } from '../../hooks/useEngine';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useAppInitialization } from '../../hooks/useAppInitialization';
import i18n from '../../i18n';
import { validateProjectDiagramState } from '../../utils/diagramValidation';
import { config } from '../../config/app.config';
import Toolbar from './Toolbar';
import ActivityPaletteSidebar from './ActivityPaletteSidebar';
import PropertiesSidebar from './PropertiesSidebar';
import MainContent from './MainContent';
import StatusBar from './StatusBar';
import CodeModal from './CodeModal';
import ConfirmDialog from '../Common/ConfirmDialog';
import { LoadingOverlay } from '../Common/Loading';
import { MermaidPreview } from '../Common/MermaidPreview';
import HelpDialog from '../Common/HelpDialog';
import { WelcomeScreen } from '../Common/WelcomeScreen';
import RecoveryDialog from '../Common/RecoveryDialog';
import { OnboardingTour } from '../Common/OnboardingTour';
import LibraryBrowser from '../LibraryBrowser/LibraryBrowser';

const noopClearBackup = () => undefined;
const noopDismissRecovery = () => undefined;
const noopRestoreBackup = async () => null;

const Layout: React.FC = () => {
  const { t } = useTranslation('common');
  const [showConsole, setShowConsole] = useState(config.console.defaultOpen);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string> | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showMermaidPreview, setShowMermaidPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLibraryBrowser, setShowLibraryBrowser] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [statefulDialog, setStatefulDialog] = useState<{ libraries: string[]; mode: 'run' | 'debug' } | null>(null);
  const { isInitializing } = useAppInitialization();
  const welcomeShownRef = useRef(false);
  const initialLoadComplete = useRef(false);
  const prevDiagramRef = useRef<string>('');
  const projectLoadedRef = useRef(false);

  // Show welcome screen on first launch after initialization completes if no project is loaded
  useEffect(() => {
    if (!isInitializing && !welcomeShownRef.current) {
      welcomeShownRef.current = true;
      if (!projectLoadedRef.current) {
        setShowWelcome(true);
      }
    }
  }, [isInitializing]);

  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const executionState = useExecutionStore((state) => state.executionState);
  const executionSpeed = useExecutionStore((state) => state.executionSpeed);
  const executionProgress = useExecutionStore((state) => state.executionProgress);
  const metadata = useProcessMetadataStore((state) => state.metadata);
  const setMetadata = useProcessMetadataStore((state) => state.setMetadata);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const saveDiagramDocument = useDiagramStore((state) => state.saveDiagramDocument);
  const loadVariables = useVariableStore((state) => state.loadVariables);
  const { isStepLoading, isDebugging, setDebugging, setCallStack, setVariables, setStepLoading } = useDebuggerStore(
    useShallow((state) => ({
      isStepLoading: state.isStepLoading,
      isDebugging: state.isDebugging,
      setDebugging: state.setDebugging,
      setCallStack: state.setCallStack,
      setVariables: state.setVariables,
      setStepLoading: state.setStepLoading,
    }))
  );
  const addConsoleLog = useConsoleStore((state) => state.addLog);
  const { markDirty, isDirty } = useFileStore();
  const {
    isConnected,
    bridgeStatus,
    capabilities,
    connect,
    runDiagram,
    stopProcess,
    pauseProcess,
    resumeProcess,
    generateCode,
    checkStatefulLibraries,
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

  const autoSave = useAutoSave({
    enabled: config.autosave.enabled,
    intervalMs: config.autosave.intervalMs,
  });
  const recoveryBackup = autoSave?.recoveryBackup ?? null;
  const recoveryError = autoSave?.recoveryError ?? null;
  const restoreBackup = autoSave?.restoreBackup ?? noopRestoreBackup;
  const clearBackup = autoSave?.clearBackup ?? noopClearBackup;
  const dismissRecovery = autoSave?.dismissRecovery ?? noopDismissRecovery;

  const handleRestoreBackup = useCallback(async () => {
    try {
      const backup = await restoreBackup();
      if (!backup) throw new Error(t('recovery.notFound', 'The autosave is no longer available.'));

      const restoredMetadata = backup.metadata;
      const restoredNodes = backup.nodes;
      const restoredEdges = backup.edges;
      const startCount = restoredNodes.filter((node) => node.data?.blockData?.type === 'start').length;
      if (!restoredMetadata?.id || !restoredMetadata?.name || startCount !== 1) {
        throw new Error(t('recovery.invalid', 'The autosave document failed validation.'));
      }

      setMetadata(restoredMetadata);
      setNodes(restoredNodes);
      setEdges(restoredEdges as Edge[]);
      useSelectionStore.getState().clearSelection();
      useHistoryStore.getState().clearHistory();
      useExecutionStore.getState().resetExecution();
      loadVariables(project?.id ?? restoredMetadata.id, backup.variables ?? recoveryBackup?.variables ?? []);

      if (project && activeDiagramId) {
        saveDiagramDocument(activeDiagramId, {
          metadata: restoredMetadata,
          nodes: restoredNodes,
          edges: restoredEdges as Edge[],
        });
      }

      markDirty(true);
      clearBackup();
      dismissRecovery();
      toast.success(t('recovery.restored', 'Autosave restored successfully.'));
    } catch (error) {
      toast.error(t('recovery.failed', 'Autosave recovery failed.'), {
        description: error instanceof Error ? error.message : t('recovery.invalid', 'The autosave document failed validation.'),
      });
    }
  }, [activeDiagramId, clearBackup, dismissRecovery, loadVariables, markDirty, project, recoveryBackup, restoreBackup, saveDiagramDocument, setEdges, setMetadata, setNodes, t]);

  const handleDiscardBackup = useCallback(() => {
    clearBackup();
    dismissRecovery();
  }, [clearBackup, dismissRecovery]);

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
  }, [addConsoleLog, connect, isConnected, t]);

  useEffect(() => {
    if (!metadata || nodes.length === 0) {
      return;
    }

    const currentDiagram = JSON.stringify({ nodes: nodes.length, edges: edges.length, metadataId: metadata.id });

    if (!initialLoadComplete.current) {
      prevDiagramRef.current = currentDiagram;
      initialLoadComplete.current = true;
      projectLoadedRef.current = true;
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
        
        const { libraries } = await checkStatefulLibraries({ nodes, edges });
        if (libraries.length > 0) {
          setStatefulDialog({ libraries, mode });
          setLoading('execute', false);
          setLoadingMessage(null);
          return;
        }
        
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
  }, [addConsoleLog, checkStatefulLibraries, connect, isConnected, metadata, nodes, edges, runDiagram, syncBreakpoints, setLoading, setLoadingMessage, setDebugging, t]);

  const handleDebug = useCallback(() => handleRun('debug'), [handleRun]);
  const handlePlay = useCallback(() => handleRun('run'), [handleRun]);

  const startExecution = useCallback(async (mode: 'run' | 'debug') => {
    try {
      setLoading('execute', true);
      setLoadingMessage(t(mode === 'debug' ? 'execution.startingDebug' : 'execution.startingProcess'));
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
  }, [addConsoleLog, getVariables, getCallStack, setVariables, setCallStack, t]);

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
  }, [stepOver, refreshDebuggerState, isStepLoading, setStepLoading, t]);

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
  }, [stepInto, refreshDebuggerState, isStepLoading, setStepLoading, t]);

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
  }, [stepOut, refreshDebuggerState, isStepLoading, setStepLoading, t]);

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
  }, [addConsoleLog, connect, generateRobotSource, isConnected, t]);

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
      <Toolbar
        onPlay={handlePlay}
        onDebug={handleDebug}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onExportCode={handleExportCode}
        onShowMermaid={handleShowMermaid}
        onShowLibraryBrowser={() => setShowLibraryBrowser(true)}
        onStepOver={handleStepOver}
        onStepInto={handleStepInto}
        onStepOut={handleStepOut}
      />

      <div className="flex-1 flex overflow-hidden">
        <ActivityPaletteSidebar
          width={leftWidth}
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
        onRestartBridge={() => { void window.rpaforge?.bridge.restart(); }}
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

      <ConfirmDialog
        open={statefulDialog !== null}
        title={t('execution.statefulLibraryTitle') || 'Stateful Library Warning'}
        message={
          statefulDialog
            ? `${t('execution.statefulLibraryWarning') || 'The following libraries maintain state across activities. Timeouts will reset their state:'}\n\n${statefulDialog.libraries.join(', ')}`
            : ''
        }
        confirmLabel={t('actions.continue') || 'Continue'}
        destructive={false}
        onConfirm={() => {
          const dialog = statefulDialog;
          setStatefulDialog(null);
          if (dialog) {
            startExecution(dialog.mode);
          }
        }}
        onCancel={() => setStatefulDialog(null)}
      />

      <HelpDialog open={showHelp} onClose={() => setShowHelp(false)} />

      {showLibraryBrowser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-ui-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-ui-border">
              <h2 className="text-xl font-bold text-ui-text">{t('libraries.title')}</h2>
              <button
                className="p-1 rounded hover:bg-ui-surface-hover"
                onClick={() => setShowLibraryBrowser(false)}
              >
                <FiX className="w-5 h-5 text-ui-text-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <LibraryBrowser />
            </div>
          </div>
        </div>
      )}

      {showWelcome && !project && (
        <WelcomeScreen
          onNewProcess={() => newProject('New Project')}
          onOpenProcess={() => void handleOpenProject()}
          onDismiss={() => setShowWelcome(false)}
          onImportMermaid={handleShowMermaid}
          onBrowseLibraries={() => setShowLibraryBrowser(true)}
          onGettingStarted={() => {
            setShowWelcome(false);
          }}
        />
      )}

      <RecoveryDialog
        backup={recoveryBackup}
        error={recoveryError}
        onRestore={() => void handleRestoreBackup()}
        onDiscard={handleDiscardBackup}
        onClose={() => undefined}
      />

      <OnboardingTour />
    </div>
  );
};

export default Layout;
