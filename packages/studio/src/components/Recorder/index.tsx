import React, { useState, useCallback } from 'react';
import RecorderToolbar from './RecorderToolbar';
import ActionCapture from './ActionCapture';
import ActionList from './ActionList';
import type { RecordedAction, CandidateSelector } from './SelectorInference';

const Recorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);

  const handleStart = useCallback(() => {
    setIsRecording(true);
    setIsPaused(false);
  }, []);

  const handleStop = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const handleAction = useCallback((action: RecordedAction) => {
    setActions((prev) => [...prev, action]);
  }, []);

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

      <ActionCapture
        isRecording={isRecording && !isPaused}
        onAction={handleAction}
      />

      <div className="flex-1 overflow-hidden">
        <ActionList
          actions={actions}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onExport={handleExport}
        />
      </div>
    </div>
  );
};

export default Recorder;
