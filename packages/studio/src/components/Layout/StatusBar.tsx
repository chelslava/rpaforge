import React, { useState, useEffect, useMemo } from 'react';
import {
  FiPause,
  FiPlay,
  FiSquare,
  FiActivity,
  FiZap,
  FiDatabase,
  FiAlertTriangle,
  FiHeart,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { ExecutionState, ExecutionSpeed } from '../../stores/processStore';
import type { ProcessMetadata } from '../../stores/processStore';
import type { Capabilities } from '../../types/engine';
import type { BridgeStatus } from '../../types/events';
import { useFileStore } from '../../stores/fileStore';
import { useStorageStats } from '../../hooks/useStorageStats';
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
}) => {
  const { t } = useTranslation('common');
  const isDirty = useFileStore((state) => state.isDirty);
  const lastSaved = useFileStore((state) => state.lastSaved);
  const { isWarning, isExceeded } = useStorageStats();

  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [showStorageDialog, setShowStorageDialog] = useState(false);

  const currentTip = t(`status.${TIPS_KEYS[currentTipIndex % TIPS_KEYS.length]}`);

  useEffect(() => {
    setShowTip(false);
    const timer = setTimeout(() => {
      setShowTip(true);
      setCurrentTipIndex((prev) => (prev + 1) % TIPS_KEYS.length);
    }, 5000);
    return () => clearTimeout(timer);
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

    let colorClass = 'text-slate-500';
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
            <span className="flex items-center gap-1 text-slate-500">
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
        return <span className="text-slate-500">{t('status.ready')}</span>;
    }
  };

  return (
    <footer className="h-6 bg-slate-100 dark:bg-slate-800 text-xs flex items-center px-4 justify-between flex-shrink-0 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">{getExecutionInfo()}</span>
        {metadata && <span className="text-slate-500">{metadata.name}</span>}
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
        {!isDebugging && (
          <button
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            onClick={onToggleConsole}
          >
            {showConsole ? t('status.hideConsole') : t('status.showConsole')}
          </button>
        )}
        <button
          className={`flex items-center gap-1 ${
            isExceeded ? 'text-red-500' : isWarning ? 'text-yellow-500' : 'text-slate-500'
          } hover:text-slate-700 dark:hover:text-slate-300`}
          onClick={() => setShowStorageDialog(true)}
          title={t('dialogs.storage')}
        >
          {isExceeded ? <FiAlertTriangle className="w-3 h-3" /> : <FiDatabase className="w-3 h-3" />}
        </button>
        <span className="text-slate-500">{runtimeSummary}</span>
      </div>
      <StorageDialog isOpen={showStorageDialog} onClose={() => setShowStorageDialog(false)} />
    </footer>
  );
});

StatusBar.displayName = 'StatusBar';

export default StatusBar;
