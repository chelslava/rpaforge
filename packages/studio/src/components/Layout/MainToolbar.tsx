import React, { useState, useMemo, useEffect } from 'react';
import {
  FiPlay,
  FiPause,
  FiSquare,
  FiCode,
  FiArrowDownCircle,
  FiArrowDownRight,
  FiArrowUpCircle,
  FiActivity,
  FiFolder,
  FiInfo,
  FiSettings,
  FiX,
  FiSun,
  FiMoon,
} from 'react-icons/fi';
import { FaProjectDiagram } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { useBlockStore } from '../../stores/blockStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useEngine } from '../../hooks/useEngine';
import FileMenu from '../Common/FileMenu';
import SettingsDialog from '../Common/SettingsDialog';
import HelpDialog from '../Common/HelpDialog';

import type { ExecutionSpeed } from '../../stores/processStore';

interface MainToolbarProps {
  onPlay: () => void;
  onDebug: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExportCode: () => void;
  onShowMermaid?: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
}

const MainToolbar: React.FC<MainToolbarProps> = React.memo(({
  onPlay,
  onDebug,
  onPause,
  onResume,
  onStop,
  onExportCode,
  onShowMermaid,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const { t } = useTranslation('common');
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);
  const resolvedTheme = useResolvedTheme();

  // Read execution state from stores
  const { isRunning, isPaused, bridgeState } = useEngine();
  const isStepLoading = useDebuggerStore((s) => s.isStepLoading);
  const executionSpeed = useExecutionStore((s) => s.executionSpeed);
  const setExecutionSpeed = useExecutionStore((s) => s.setExecutionSpeed);
  const hasMetadata = !!useProcessMetadataStore((s) => s.metadata);
  const hasNodes = useBlockStore((s) => s.nodes.length > 0);
  const projectName = useDiagramStore((s) => s.project?.name);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const speedOptions: ExecutionSpeed[] = [0.5, 1, 2, 5];

  const executionButton = useMemo(() => {
    if (isRunning) {
      if (isPaused) {
        return (
          <button className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1" onClick={onResume}>
            <FiPlay className="w-4 h-4" />{t('toolbar.resume')}
          </button>
        );
      }
      return (
        <button className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-700 flex items-center gap-1" onClick={onPause}>
          <FiPause className="w-4 h-4" />{t('toolbar.pause')}
        </button>
      );
    }
    return (
      <>
        <button
          className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onPlay}
          disabled={!hasMetadata}
          title={!hasMetadata ? t('toolbar.openOrCreateProject') : t('toolbar.runProcessF5')}
        >
          <FiPlay className="w-4 h-4" />{t('toolbar.run')}
        </button>
        <button
          className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onDebug}
          disabled={!hasMetadata}
          title={!hasMetadata ? t('toolbar.openOrCreateProject') : t('toolbar.debug')}
        >
          <FiActivity className="w-4 h-4" />{t('toolbar.debug')}
        </button>
      </>
    );
  }, [isRunning, isPaused, hasMetadata, onPlay, onDebug, onPause, onResume, t]);

  const bridgeBadge = {
    starting: 'text-blue-400',
    ready: 'text-green-400',
    degraded: 'text-yellow-400',
    reconnecting: 'text-amber-400',
    stopped: 'text-ui-text-subtle',
  }[bridgeState];

  const bridgeLabel = bridgeState.charAt(0).toUpperCase() + bridgeState.slice(1);

  const getBridgeTooltip = () => {
    switch (bridgeState) {
      case 'ready':
        return t('bridge.ready');
      case 'starting':
        return t('bridge.starting');
      case 'degraded':
        return t('bridge.degraded');
      case 'reconnecting':
        return t('bridge.reconnecting');
      default:
        return t('bridge.stopped');
    }
  };

  return (
    <header className="h-12 bg-ui-toolbar text-ui-text-inverse flex items-center px-4 justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">{t('app.name')}</h1>
        <button
          className="p-1.5 rounded hover:bg-ui-toolbar-hover text-ui-text-subtle hover:text-ui-text-inverse transition-colors"
          onClick={() => setShowAbout(true)}
          title={t('toolbar.about')}
          aria-label={t('toolbar.about')}
        >
          <FiInfo className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded hover:bg-ui-toolbar-hover text-ui-text-subtle hover:text-ui-text-inverse transition-colors"
          onClick={() => setShowSettings(true)}
          title={t('toolbar.settings')}
          aria-label={t('toolbar.settings')}
        >
          <FiSettings className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded hover:bg-ui-toolbar-hover text-ui-text-subtle hover:text-ui-text-inverse transition-colors"
          onClick={() => toggleTheme(resolvedTheme)}
          title={resolvedTheme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}
          aria-label={resolvedTheme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}
        >
          {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
        </button>
        <button
          className="p-1.5 rounded hover:bg-ui-toolbar-hover text-ui-text-subtle hover:text-ui-text-inverse transition-colors font-semibold text-sm"
          onClick={() => setShowShortcuts(true)}
          title={t('toolbar.keyboardShortcuts')}
          aria-label={t('toolbar.keyboardShortcuts')}
        >
          ?
        </button>
        {projectName && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-ui-toolbar-hover rounded">
            <FiFolder className="w-4 h-4 text-ui-primary" />
            <span className="text-sm font-medium">{projectName}</span>
          </div>
        )}
        <FileMenu />
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-xs flex items-center gap-1 ${bridgeBadge}`}
          title={getBridgeTooltip()}
        >
          <span className={`w-2 h-2 rounded-full ${bridgeState === 'ready' ? 'bg-green-400' : bridgeState === 'degraded' ? 'bg-yellow-400' : bridgeState === 'reconnecting' ? 'bg-amber-400' : bridgeState === 'starting' ? 'bg-blue-400' : 'bg-slate-400'}`} />
          {t('bridge.title')} {bridgeLabel}
        </span>

        <div className="flex items-center gap-1">
          <button
            className="px-3 py-1 bg-ui-secondary rounded hover:bg-ui-secondary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onExportCode}
            disabled={!hasNodes}
            title={!hasNodes ? t('toolbar.addBlocksFirst') : t('toolbar.export')}
            aria-disabled={!hasNodes}
          >
            <FiCode className="w-4 h-4" />
            {t('toolbar.export')}
          </button>
          <button
            className="px-3 py-1 bg-ui-secondary rounded hover:bg-ui-secondary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onShowMermaid}
            disabled={!hasNodes}
            title={!hasNodes ? t('toolbar.addBlocksFirst') : t('toolbar.viewMermaid')}
            aria-disabled={!hasNodes}
          >
            <FaProjectDiagram className="w-4 h-4" />
            {t('toolbar.diagram')}
          </button>

          <div
            className="flex items-center gap-1 px-2 py-1 bg-ui-toolbar-hover rounded"
            title={isRunning ? t('toolbar.cannotChangeSpeed') : t('toolbar.executionSpeed')}
          >
            <FiActivity className="w-4 h-4 text-ui-text-inverse" />
            <select
              value={executionSpeed}
              onChange={(e) => setExecutionSpeed(parseFloat(e.target.value) as ExecutionSpeed)}
              className="bg-ui-secondary text-ui-text-inverse text-sm rounded px-1 py-0.5 border-none outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isRunning}
              aria-label={t('toolbar.executionSpeed')}
            >
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </div>

          {executionButton}
          {isRunning && isPaused && (
            <>
              <div data-tour="debug-toolbar">
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepOver}
                disabled={isStepLoading}
                title={t('toolbar.stepOver')}
              >
                <FiArrowDownCircle className="w-4 h-4" />
                {t('toolbar.over')}
              </button>
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepInto}
                disabled={isStepLoading}
                title={t('toolbar.stepInto')}
              >
                <FiArrowDownRight className="w-4 h-4" />
                {t('toolbar.into')}
              </button>
              <button
                className="px-2 py-1 bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStepOut}
                disabled={isStepLoading}
                title={t('toolbar.stepOut')}
              >
                <FiArrowUpCircle className="w-4 h-4" />
                {t('toolbar.out')}
              </button>
              </div>
            </>
          )}
          {isRunning && (
            <button
              className="px-3 py-1 bg-red-600 rounded hover:bg-red-700 flex items-center gap-1"
              onClick={onStop}
            >
              <FiSquare className="w-4 h-4" />
              {t('toolbar.stop')}
            </button>
          )}
        </div>
      </div>

      {showAbout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-ui-surface rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-ui-text">{t('about.title')}</h2>
              <button
              className="p-1 rounded hover:bg-ui-surface-hover"
                onClick={() => setShowAbout(false)}
              >
                <FiX className="w-5 h-5 text-ui-text-muted" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-ui-text-muted">
              <p className="font-medium text-ui-text text-base">
                {t('about.subtitle')}
              </p>
              <p>
                {t('about.description')}
              </p>
              <div className="bg-ui-surface-muted rounded p-3">
                <div className="font-medium text-ui-text mb-2">{t('about.quickStart')}</div>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>{t('about.step1')}</li>
                  <li>{t('about.step2')}</li>
                  <li>{t('about.step3')}</li>
                  <li>{t('about.step4')}</li>
                  <li>{t('about.step5')}</li>
                </ol>
              </div>
              <p className="text-xs text-ui-text-subtle">
                {t('about.version', { version: '0.3.0' })}
              </p>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <HelpDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </header>
  );
});

MainToolbar.displayName = 'MainToolbar';

export default MainToolbar;
