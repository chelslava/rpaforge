import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  FiPause,
  FiPlay,
  FiSquare,
  FiActivity,
  FiZap,
  FiDatabase,
  FiAlertTriangle,
  FiHeart,
  FiServer,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { ExecutionState, ExecutionSpeed } from '../../stores/processStore';
import type { ProcessMetadata } from '../../stores/processStore';
import type { Capabilities } from '../../types/engine';
import type { BridgeStatus } from '../../types/events';
import { useFileStore } from '../../stores/fileStore';
import { useBlockStore } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useStorageStats } from '../../hooks/useStorageStats';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import StorageDialog from '../Common/StorageDialog';

const TIPS_KEYS = [
  'tip.quickAdd',
  'tip.dragConnect',
  'tip.copyPaste',
  'tip.doubleClick',
  'tip.pressF5',
  'tip.breakpoints',
  'tip.variablePanel',
  'tip.exportPython',
  'tip.saveProject',
] as const;

interface StatusBarProps {
  isDebugging: boolean;
  bridgeStatus: BridgeStatus | null;
  capabilities: Capabilities | null;
  executionState: ExecutionState;
  executionSpeed: ExecutionSpeed;
  metadata: ProcessMetadata | null;
  showConsole: boolean;
  onToggleConsole: () => void;
  onRestartBridge?: () => void;
  onOpenControlTower?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = React.memo(({
  isDebugging,
  bridgeStatus,
  capabilities,
  executionState,
  executionSpeed,
  metadata,
  showConsole,
  onToggleConsole,
  onRestartBridge,
  onOpenControlTower,
}) => {
  const { t } = useTranslation('common');
  const isDirty = useFileStore((state) => state.isDirty);
  const lastSaved = useFileStore((state) => state.lastSaved);
  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const undoStack = useHistoryStore((state) => state.undoStack);
  const redoStack = useHistoryStore((state) => state.redoStack);
  const performUndo = useHistoryStore((state) => state.undo);
  const performRedo = useHistoryStore((state) => state.redo);
  const { isWarning, isExceeded } = useStorageStats();

  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [showStorageDialog, setShowStorageDialog] = useState(false);

  const currentTip = t(`status.${TIPS_KEYS[currentTipIndex % TIPS_KEYS.length]}`);

  const handleUndo = useCallback(() => {
    const snapshot = performUndo(nodes, edges);
    if (snapshot) {
      setNodes(snapshot.nodes as typeof nodes);
      setEdges(snapshot.edges);
    }
  }, [edges, nodes, performUndo, setEdges, setNodes]);

  const handleRedo = useCallback(() => {
    const snapshot = performRedo(nodes, edges);
    if (snapshot) {
      setNodes(snapshot.nodes as typeof nodes);
      setEdges(snapshot.edges);
    }
  }, [edges, nodes, performRedo, setEdges, setNodes]);

  useEffect(() => {
    // Show the current tip briefly on mount / rotation, then hide and
    // advance. setState lives in timer callbacks — not in the effect
    // body — per react-hooks/set-state-in-effect.
    const showTimer = setTimeout(() => setShowTip(true), 0);
    const rotateTimer = setTimeout(() => {
      setShowTip(false);
      setCurrentTipIndex((prev) => (prev + 1) % TIPS_KEYS.length);
    }, 5000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(rotateTimer);
    };
  }, [currentTipIndex]);

  const savedTime = lastSaved
    ? new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const getSaveIndicator = () => {
    if (isDirty) {
      return <span className="text-yellow-400">{t('status.unsaved')}</span>;
    }
    if (savedTime) {
      return <span className="text-green-400">{t('status.saved', { time: savedTime })}</span>;
    }
    return null;
  };

  const runtimeSummary = useMemo(() => {
    if (!capabilities) {
      return t('status.capabilitiesUnavailable');
    }
    const debuggerStatus = capabilities.features.debugger
      ? t('status.debuggerPresent')
      : t('status.debuggerMissing');
    return t('status.runtimeSummary', {
      version: capabilities.version,
      debuggerStatus,
      libraryCount: capabilities.libraries.length,
    });
  }, [capabilities, t]);

  const getBridgeIndicator = () => {
    const state = bridgeStatus?.state ?? 'stopped';
    const failures = bridgeStatus?.consecutiveHeartbeatFailures ?? 0;
    const isReconnecting = state === 'reconnecting';
    const avgResponse = bridgeStatus?.averageResponseTimeMs;

    let colorClass = 'text-slate-500 dark:text-slate-400';
    let pulse = false;

    if (isReconnecting) {
      colorClass = 'text-red-500';
      pulse = true;
    } else if (state === 'ready') {
      colorClass = failures > 0 ? 'text-yellow-500' : 'text-green-500';
    } else if (state === 'degraded') {
      colorClass = 'text-yellow-500';
    } else if (state === 'stopped') {
      colorClass = 'text-red-500';
    } else if (state === 'starting') {
      colorClass = 'text-blue-500';
      pulse = true;
    }

    let statusText: string;
    if (isReconnecting) {
      statusText = t('status.reconnecting');
    } else if (state === 'degraded') {
      statusText = t('status.degraded', { failures });
    } else {
      statusText = state.charAt(0).toUpperCase() + state.slice(1);
    }

    const responseInfo = avgResponse ? ` · ${Math.round(avgResponse)}ms` : '';

    const canRestart = (state === 'stopped') && !!onRestartBridge;

    return (
      <span
        className={`flex items-center gap-1 ${colorClass}`}
        title={`Bridge: ${state}${bridgeStatus?.error ? ` - ${bridgeStatus.error}` : ''}`}
      >
        <FiHeart className={`w-3 h-3 ${pulse ? 'animate-pulse' : ''}`} />
        <span>
          {t('status.bridge')} {statusText}
          {responseInfo}
        </span>
        {failures > 0 && state !== 'degraded' && state !== 'reconnecting' && (
          <span className="text-yellow-500 text-xs">({failures})</span>
        )}
        {canRestart && (
          <button
            className="ml-1 underline hover:no-underline text-red-400 hover:text-red-300"
            onClick={onRestartBridge}
            title={t('status.restartBridge')}
          >
            {t('status.restartBridge')}
          </button>
        )}
      </span>
    );
  };

  const getExecutionInfo = () => {
    switch (executionState) {
      case 'running':
        return (
          <span className="flex items-center gap-2 text-green-600">
            <FiPlay className="w-3 h-3" />
            {t('status.running')}
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <FiActivity className="w-3 h-3" />
              {executionSpeed}x
            </span>
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1 text-yellow-600">
            <FiPause className="w-3 h-3" />
            {t('status.paused')}
          </span>
        );
      case 'stopped':
        return (
          <span className="flex items-center gap-1 text-red-500">
            <FiSquare className="w-3 h-3" />
            {t('status.stopped')}
          </span>
        );
      default:
        return <span className="text-slate-500 dark:text-slate-400">{t('status.ready')}</span>;
    }
  };

  return (
    <footer className="h-6 bg-slate-100 dark:bg-slate-800 text-xs flex items-center px-4 justify-between flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">{getExecutionInfo()}</span>
        {metadata && <span className="text-slate-500 dark:text-slate-400">{metadata.name}</span>}
        {getBridgeIndicator()}
        {!isDebugging && executionState !== 'running' && (
          <span
            className={`text-indigo-600 dark:text-indigo-400 flex items-center gap-1 transition-opacity ${
              showTip ? 'opacity-100' : 'opacity-0'
            }`}
            title={currentTip}
          >
            <FiZap className="w-3 h-3" />
            <span className="max-w-48 truncate">{currentTip}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {getSaveIndicator()}
        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400" aria-label={t('status.history', 'History')}>
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className="hover:text-slate-700 dark:hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={t('status.undoHint', 'Undo the last change')}
          >
            {t('status.undo', 'Undo')} ({undoStack.length})
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            className="hover:text-slate-700 dark:hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={t('status.redoHint', 'Redo the last undone change')}
          >
            {t('status.redo', 'Redo')} ({redoStack.length})
          </button>
        </div>
        {!isDebugging && (
          <button
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            onClick={onToggleConsole}
          >
            {showConsole ? t('status.hideConsole') : t('status.showConsole')}
          </button>
        )}
        <OrchestratorChip onOpen={onOpenControlTower} />
        <button
          className={`flex items-center gap-1 ${
            isExceeded ? 'text-red-500 dark:text-red-400' : isWarning ? 'text-yellow-500 dark:text-yellow-400' : 'text-slate-500 dark:text-slate-400'
          } hover:text-slate-700 dark:hover:text-slate-300`}
          onClick={() => setShowStorageDialog(true)}
          title={t('dialogs.storage')}
        >
          {isExceeded ? <FiAlertTriangle className="w-3 h-3" /> : <FiDatabase className="w-3 h-3" />}
        </button>
        <span className="text-slate-500 dark:text-slate-400">{runtimeSummary}</span>
      </div>
      <StorageDialog isOpen={showStorageDialog} onClose={() => setShowStorageDialog(false)} />
    </footer>
  );
});

StatusBar.displayName = 'StatusBar';


/** Control Tower status chip (issue #858): active daemon connection health. */
function OrchestratorChip({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation('common');
  const connections = useOrchestratorStore((s) => s.connections);
  const activeConnectionId = useOrchestratorStore((s) => s.activeConnectionId);
  const health = useOrchestratorStore((s) => s.health);

  if (!connections.length) return null;
  const active = connections.find((c) => c.id === activeConnectionId) ?? null;
  const state = active ? (health[active.id] ?? 'unknown') : 'unknown';
  const dotClass =
    state === 'healthy'
      ? 'bg-green-500'
      : state === 'unreachable' || state === 'auth-error'
        ? 'bg-red-500'
        : 'bg-gray-400';

  return (
    <button
      type="button"
      data-testid="statusbar-orchestrator"
      onClick={onOpen}
      className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
      title={t('orchestrator.title')}
    >
      <FiServer className="h-3 w-3" />
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="max-w-32 truncate">{active?.name ?? t('orchestrator.title')}</span>
    </button>
  );
}

export default StatusBar;
