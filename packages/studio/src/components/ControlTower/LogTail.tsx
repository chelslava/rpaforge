import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPause, FiPlay } from 'react-icons/fi';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import type { OrchestratorLogStreamChunk } from '../../types/ipc-contracts';

const TAIL_SIZES = [50, 200, 1000] as const;
/** Poll cadence used when the live stream is unavailable (fallback). */
const LIVE_POLL_MS = 1500;

interface LogTailProps {
  itemId: string;
}

/**
 * NDJSON log tail for one run (serve `GET /runs/{id}/logs?tail=N`).
 * Live mode (issue #878): the main process streams the `follow=1` response
 * over IPC and complete lines arrive as chunks; when the stream errors or
 * the bridge lacks streaming, this falls back to fixed-cadence polling.
 */
const LogTail: React.FC<LogTailProps> = ({ itemId }) => {
  const { t } = useTranslation('common');
  const fetchLogs = useOrchestratorStore((s) => s.fetchLogs);
  const [lines, setLines] = useState<string[]>([]);
  const [tailSize, setTailSize] = useState<number>(200);
  const [live, setLive] = useState(false);
  const [missing, setMissing] = useState(false);
  /** True when streaming failed and the poll fallback took over. */
  const [streamFailed, setStreamFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  /** Incomplete trailing line carried between stream chunks. */
  const lineBuffer = useRef('');

  const refresh = useCallback(async () => {
    try {
      const result = await fetchLogs(itemId, tailSize);
      if (result.status === 404) {
        setMissing(true);
        setLines([]);
        return;
      }
      setMissing(false);
      setLines(result.lines);
    } catch {
      // Transient proxy/network hiccup: keep previous lines, retry next tick.
    }
  }, [fetchLogs, itemId, tailSize]);

  const handleChunk = useCallback((chunk: OrchestratorLogStreamChunk) => {
    if (chunk.error) {
      setStreamFailed(true);
      return;
    }
    if (chunk.text) {
      lineBuffer.current += chunk.text;
      const parts = lineBuffer.current.split('\n');
      lineBuffer.current = parts.pop() ?? '';
      const complete = parts.filter((line) => line.length > 0);
      if (complete.length > 0) {
        setMissing(false);
        setLines((prev) => [...prev, ...complete].slice(-1000));
      }
    }
    if (chunk.done) {
      // Server closed the follow window (run finished or 600s cap).
      setLive(false);
      lineBuffer.current = '';
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: all state updates happen after the await inside
    // `refresh`; the conservative hook rule cannot see through the
    // useCallback chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return undefined;
    if (streamFailed) return undefined;
    // Reset the snapshot: the follow stream replays the full log file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines([]);
    lineBuffer.current = '';
    stickToBottom.current = true;
    const unsubscribe = useOrchestratorStore
      .getState()
      .subscribeRunLogs(itemId, handleChunk);
    return () => {
      unsubscribe();
    };
  }, [live, streamFailed, itemId, handleChunk]);

  useEffect(() => {
    // Fallback: stream unavailable — near-real-time via the tail endpoint.
    if (!live || !streamFailed) return;
    const timer = window.setInterval(() => void refresh(), LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, streamFailed, refresh]);

  useEffect(() => {
    if (live && stickToBottom.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, live]);

  const toggleLive = () => {
    if (!live) {
      setStreamFailed(false);
      setLive(true);
    } else {
      setLive(false);
    }
  };

  return (
    <div className="flex flex-col rounded bg-ui-surface-muted">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-xs font-semibold text-ui-text">{t('orchestrator.runs.logTitle')}</span>
        <select
          aria-label={t('orchestrator.runs.logTail')}
          value={tailSize}
          onChange={(event) => {
            setLines([]);
            setMissing(false);
            stickToBottom.current = true;
            setTailSize(Number(event.target.value));
          }}
          className="rounded border border-ui-border bg-ui-surface px-1 py-0.5 text-xs text-ui-text"
        >
          {TAIL_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleLive}
          aria-pressed={live}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
            live ? 'bg-accent-primary/20 text-accent-primary' : 'text-ui-text-muted hover:bg-ui-surface-hover'
          }`}
        >
          {live ? <FiPause className="h-3 w-3" /> : <FiPlay className="h-3 w-3" />}
          {live ? t('orchestrator.runs.logStop') : t('orchestrator.runs.logFollow')}
        </button>
      </div>
      <div
        ref={containerRef}
        data-testid="orchestrator-log-lines"
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current =
            Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 8;
        }}
        className="max-h-48 min-h-16 overflow-auto px-2 pb-2 font-mono text-[11px] leading-4 text-ui-text-muted"
      >
        {missing ? (
          <div>{t('orchestrator.runs.logMissing')}</div>
        ) : lines.length === 0 ? (
          <div>{t('orchestrator.runs.logEmpty')}</div>
        ) : (
          lines.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogTail;
