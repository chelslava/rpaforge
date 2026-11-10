import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGitMerge } from 'react-icons/fi';
import RecorderToolbar from './RecorderToolbar';
import ActionList from './ActionList';
import type { RecordedAction, CandidateSelector } from './SelectorInference';
import { convertRecordingToDiagram } from './recordingConverter';
import { dedupeActions, dedupRemovedCount } from './recordingDedup';
import { DiagramMiniCanvas } from '../SourceControl/DiagramMiniCanvas';
import { useBlockStore } from '../../stores/blockStore';
import { useAiGeneration, type AiGeneratePreview } from '../../hooks/useAiGeneration';

const Recorder: React.FC = () => {
  const { t } = useTranslation('common');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<AiGeneratePreview | null>(null);
  // Deterministic smart dedup (issue #869): on by default, opt-out.
  const [dedupEnabled, setDedupEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const { isGenerating, providerStatus, refreshProviderStatus, generate } = useAiGeneration();

  useEffect(() => {
    const unsubscribe = window.rpaforge?.bridge.onEvent((event) => {
      if (event.type === 'recordingAction') {
        setActions((prev) => [...prev, event.action]);
      }
    });
    void refreshProviderStatus();
    return unsubscribe;
  }, [refreshProviderStatus]);

  // The working list: dedup is applied live; edits below operate on it.
  const displayActions = useMemo(
    () => (dedupEnabled ? dedupeActions(actions) : actions),
    [actions, dedupEnabled],
  );

  // Live preview (issue #869): the converted diagram follows every edit.
  const previewDiagram = useMemo(
    () => convertRecordingToDiagram(displayActions, (key) => t(key)),
    [displayActions, t],
  );

  const sendRecordingCommand = useCallback(
    async (command: 'startRecording' | 'stopRecording' | 'pauseRecording' | 'resumeRecording') => {
      const bridge = window.rpaforge?.bridge;
      if (!bridge) {
        setError(t('recorder.bridgeUnavailable'));
        return false;
      }

      try {
        await bridge.send(command, {});
        setError(null);
        return true;
      } catch {
        setError(
          command === 'startRecording'
            ? t('recorder.startFailed')
            : command === 'stopRecording'
              ? t('recorder.stopFailed')
              : t('recorder.pauseFailed'),
        );
        return false;
      }
    },
    [t],
  );

  const handleStart = useCallback(async () => {
    setActions([]);
    setAiPreview(null);
    if (await sendRecordingCommand('startRecording')) {
      setIsRecording(true);
      setIsPaused(false);
    }
  }, [sendRecordingCommand]);

  const handleStop = useCallback(async () => {
    if (await sendRecordingCommand('stopRecording')) {
      setIsRecording(false);
      setIsPaused(false);
    }
  }, [sendRecordingCommand]);

  const handlePause = useCallback(async () => {
    // True session pause (issue #848): capture hooks detach but the stream
    // and counters survive — previously this split the session via stop/start.
    if (isPaused) {
      if (await sendRecordingCommand('resumeRecording')) setIsPaused(false);
    } else if (await sendRecordingCommand('pauseRecording')) {
      setIsPaused(true);
    }
  }, [isPaused, sendRecordingCommand]);

  const handleUpdate = useCallback((id: string, selector: CandidateSelector) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, selector } : a)),
    );
  }, []);

  const handleUpdateValue = useCallback((id: string, value: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, value } : a)),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleToggleInclude = useCallback((id: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, included: a.included === false } : a)),
    );
  }, []);

  const handleToggleWrap = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setActions((prev) =>
      prev.map((a) =>
        idSet.has(a.id)
          ? { ...a, wrapIn: a.wrapIn === 'try-catch' ? undefined : ('try-catch' as const) }
          : a,
      ),
    );
  }, []);

  const handleMove = useCallback((id: string, direction: -1 | 1) => {
    setActions((prev) => {
      const index = prev.findIndex((a) => a.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(displayActions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recorded-actions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayActions]);

  const handleApply = useCallback(() => {
    if (displayActions.length === 0) return;
    const diagram = convertRecordingToDiagram(displayActions, (key) => t(key));
    setNodes(diagram.nodes);
    setEdges(diagram.edges);
  }, [displayActions, setEdges, setNodes, t]);

  const handleEnhance = useCallback(async () => {
    const provider = providerStatus.find((status) => status.configured)?.provider;
    if (!provider) {
      setError(t('recorder.noProvider'));
      return;
    }

    const actionSummary = displayActions.map((action, index) =>
      `${index + 1}. ${action.source ?? 'web'} ${action.type} ${action.selector.value}${action.value ? ' <captured-value>' : ''}`,
    ).join('\n');
    const result = await generate(
      `Clean up this recorded RPA sequence. Preserve the intended order, remove redundant actions, and return a valid runnable diagram. Never expose captured values.\n${actionSummary}`,
      provider,
    );
    if (result.success && result.preview) {
      setAiPreview(result.preview);
      setError(null);
    } else {
      setError(t('recorder.enhanceFailed'));
    }
  }, [displayActions, generate, providerStatus, t]);

  const handleApplyEnhancement = useCallback(() => {
    if (!aiPreview) return;
    setNodes(aiPreview.nodes);
    setEdges(aiPreview.edges);
    setAiPreview(null);
  }, [aiPreview, setEdges, setNodes]);

  const removedCount = dedupEnabled ? dedupRemovedCount(actions) : 0;

  return (
    <div className="h-full flex flex-col" data-tour="recorder">
      <RecorderToolbar
        isRecording={isRecording}
        isPaused={isPaused}
        actionCount={displayActions.length}
        onStart={handleStart}
        onStop={handleStop}
        onPause={handlePause}
      />

      {error && <p role="status" className="px-3 py-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>}

      <div className="px-3 py-1 border-b border-slate-100 dark:border-slate-700/50">
        <button
          type="button"
          onClick={() => setDedupEnabled((value) => !value)}
          aria-pressed={dedupEnabled}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
            dedupEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
          }`}
          title={t('recorder.dedupHint')}
        >
          <FiGitMerge className="w-3 h-3" />
          {t('recorder.smartDedup')}
          {removedCount > 0 && ` (−${removedCount})`}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <ActionList
          actions={displayActions}
          onUpdate={handleUpdate}
          onUpdateValue={handleUpdateValue}
          onDelete={handleDelete}
          onToggleInclude={handleToggleInclude}
          onToggleWrap={handleToggleWrap}
          onMove={handleMove}
          onExport={handleExport}
          onApply={handleApply}
          onEnhance={() => void handleEnhance()}
          onApplyEnhancement={handleApplyEnhancement}
          isEnhancing={isGenerating}
          hasEnhancement={aiPreview !== null}
        />
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700/50">
        <button
          type="button"
          onClick={() => setPreviewOpen((value) => !value)}
          aria-expanded={previewOpen}
          className="w-full px-3 py-1 text-left text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
        >
          {t('recorder.applyPreview')} {previewOpen ? '▾' : '▸'}
        </button>
        {previewOpen && (
          <div className="h-44 overflow-hidden border-t border-slate-100 dark:border-slate-700/50" data-testid="recorder-preview">
            <DiagramMiniCanvas
              doc={{ nodes: previewDiagram.nodes, edges: previewDiagram.edges }}
              nodeStatus={new Map()}
              edgeStatus={new Map()}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Recorder;
