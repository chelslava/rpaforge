import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import RecorderToolbar from './RecorderToolbar';
import ActionList from './ActionList';
import type { RecordedAction, CandidateSelector } from './SelectorInference';
import { convertRecordingToDiagram } from './recordingConverter';
import { useBlockStore } from '../../stores/blockStore';
import { useAiGeneration, type AiGeneratePreview } from '../../hooks/useAiGeneration';

const Recorder: React.FC = () => {
  const { t } = useTranslation('common');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<AiGeneratePreview | null>(null);
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

  const sendRecordingCommand = useCallback(async (command: 'startRecording' | 'stopRecording') => {
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
      setError(command === 'startRecording' ? t('recorder.startFailed') : t('recorder.stopFailed'));
      return false;
    }
  }, [t]);

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
    if (isPaused) {
      if (await sendRecordingCommand('startRecording')) setIsPaused(false);
    } else if (await sendRecordingCommand('stopRecording')) {
      setIsPaused(true);
    }
  }, [isPaused, sendRecordingCommand]);

  const handleUpdate = useCallback((id: string, selector: CandidateSelector) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, selector } : a)),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recorded-actions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [actions]);

  const handleApply = useCallback(() => {
    if (actions.length === 0) return;
    const diagram = convertRecordingToDiagram(actions, (key) => t(key));
    setNodes(diagram.nodes);
    setEdges(diagram.edges);
  }, [actions, setEdges, setNodes, t]);

  const handleEnhance = useCallback(async () => {
    const provider = providerStatus.find((status) => status.configured)?.provider;
    if (!provider) {
      setError(t('recorder.noProvider'));
      return;
    }

    const actionSummary = actions.map((action, index) =>
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
  }, [actions, generate, providerStatus, t]);

  const handleApplyEnhancement = useCallback(() => {
    if (!aiPreview) return;
    setNodes(aiPreview.nodes);
    setEdges(aiPreview.edges);
    setAiPreview(null);
  }, [aiPreview, setEdges, setNodes]);

  return (
    <div className="h-full flex flex-col" data-tour="recorder">
      <RecorderToolbar
        isRecording={isRecording}
        isPaused={isPaused}
        actionCount={actions.length}
        onStart={handleStart}
        onStop={handleStop}
        onPause={handlePause}
      />

      {error && <p role="status" className="px-3 py-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>}

      <div className="flex-1 overflow-hidden">
        <ActionList
          actions={actions}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onExport={handleExport}
          onApply={handleApply}
          onEnhance={() => void handleEnhance()}
          onApplyEnhancement={handleApplyEnhancement}
          isEnhancing={isGenerating}
          hasEnhancement={aiPreview !== null}
        />
      </div>
    </div>
  );
};

export default Recorder;
