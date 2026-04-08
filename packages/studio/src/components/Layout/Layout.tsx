import React, { useState, useCallback, useEffect } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useEngine } from '../../hooks/useEngine';
import { generateClientRobotCode } from '../../utils/clientCodegen';
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
  const [showCodeModal, setShowCodeModal] = useState(false);

  const { executionState, metadata, nodes, edges } = useProcessStore();
  const { isPaused, setCallStack, setVariables } = useDebuggerStore();
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
  } = useEngine();

  useEffect(() => {
    if (!isConnected) {
      connect().catch((err) => {
        console.warn('[Layout] Auto-connect failed:', err);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateRobotSource = useCallback(async (): Promise<string> => {
    try {
      const code = await generateCode({ nodes, edges });
      return code ?? getFallbackSource();
    } catch {
      return getFallbackSource();
    }
  }, [generateCode, nodes, edges]);

  const getFallbackSource = (): string => {
    return `*** Tasks ***
Main Task
    Log    Process executed from RPAForge Studio
`;
  };

  const handleRun = useCallback(async () => {
    console.log('[handleRun] Starting execution, metadata:', metadata, 'isConnected:', isConnected);
    try {
      if (!isConnected) {
        console.log('[handleRun] Not connected, connecting...');
        await connect();
      }
      if (metadata) {
        console.log('[handleRun] Generating Robot Framework source...');
        const source = await generateRobotSource();
        console.log('[handleRun] Generated source (first 300 chars):', source.substring(0, 300));
        console.log('[handleRun] Calling runProcess with name:', metadata.name);
        await runProcess(source, metadata.name);
        console.log('[handleRun] runProcess completed successfully');
      } else {
        console.warn('[handleRun] No metadata available - cannot run process');
        alert('No process metadata. Please create or load a process first.');
      }
    } catch (err) {
      console.error('[handleRun] Execution failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to run process.');
    }
  }, [isConnected, connect, metadata, generateRobotSource, runProcess]);

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
    } catch {
    }
  }, [getVariables, getCallStack, setVariables, setCallStack]);

  const handleStepOver = useCallback(async () => {
    try {
      await stepOver();
      await refreshDebuggerState();
    } catch (err) {
      console.error('Step over failed:', err);
    }
  }, [stepOver, refreshDebuggerState]);

  const handleStepInto = useCallback(async () => {
    try {
      await stepInto();
      await refreshDebuggerState();
    } catch (err) {
      console.error('Step into failed:', err);
    }
  }, [stepInto, refreshDebuggerState]);

  const handleStepOut = useCallback(async () => {
    try {
      await stepOut();
      await refreshDebuggerState();
    } catch (err) {
      console.error('Step out failed:', err);
    }
  }, [stepOut, refreshDebuggerState]);

  const handleExportCode = useCallback(async () => {
    try {
      if (!isConnected) {
        await connect();
      }

      const code = await generateCode({ nodes, edges });
      setGeneratedCode(code);
      setShowCodeModal(true);
    } catch (err) {
      console.error('Failed to generate code via bridge:', err);
      setGeneratedCode(generateClientSideCode());
      setShowCodeModal(true);
    }
  }, [isConnected, connect, generateCode, nodes, edges]);

  const generateClientSideCode = (): string => {
    return generateClientRobotCode({ nodes, edges });
  };

  const handleDownloadCode = useCallback(() => {
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
  }, [generatedCode, metadata]);

  const handleCloseCodeModal = useCallback(() => {
    setShowCodeModal(false);
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
        onClose={handleCloseCodeModal}
        onDownload={handleDownloadCode}
      />
    </div>
  );
};

export default Layout;
