import React, { useEffect } from 'react';
import { FiFolder, FiActivity } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useDiagramStore } from '../../stores/diagramStore';
import { useEngine } from '../../hooks/useEngine';
import FileMenu from '../Common/FileMenu';

interface ToolbarProps {
  onPlay: () => void;
  onDebug: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExportCode: () => void;
  onShowMermaid?: () => void;
  onShowLibraryBrowser?: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = React.memo(({
  onPlay,
  onDebug,
  onPause,
  onResume,
  onStop,
  onExportCode,
  onShowMermaid,
  onShowLibraryBrowser,
  onStepOver,
  onStepInto,
  onStepOut,
}) => {
  const { t } = useTranslation('common');
  const projectName = useDiagramStore((s) => s.project?.name);
  const { bridgeState } = useEngine();

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
    <header className="min-h-14 bg-ui-toolbar text-ui-text-inverse flex items-center px-4 justify-between flex-shrink-0 py-1">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <h1 className="text-lg font-semibold shrink-0">{t('app.name')}</h1>
        {projectName && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-ui-toolbar-hover rounded shrink-0">
            <FiFolder className="w-4 h-4 text-ui-primary" />
            <span className="text-sm font-medium">{projectName}</span>
          </div>
        )}
        <FileMenu
          onPlay={onPlay}
          onDebug={onDebug}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onExportCode={onExportCode}
          onShowMermaid={onShowMermaid}
          onShowLibraryBrowser={onShowLibraryBrowser}
          onStepOver={onStepOver}
          onStepInto={onStepInto}
          onStepOut={onStepOut}
        />
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span
          className={`text-xs flex items-center gap-1 ${bridgeBadge}`}
          title={getBridgeTooltip()}
        >
          <span className={`w-2 h-2 rounded-full ${bridgeState === 'ready' ? 'bg-green-400' : bridgeState === 'degraded' ? 'bg-yellow-400' : bridgeState === 'reconnecting' ? 'bg-amber-400' : bridgeState === 'starting' ? 'bg-blue-400' : 'bg-slate-400'}`} />
          {t('bridge.title')} {bridgeLabel}
        </span>
      </div>
    </header>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
