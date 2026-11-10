import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPause, FiPlay } from 'react-icons/fi';
import { useOrchestratorStore } from '../../stores/orchestratorStore';

const TAIL_SIZES = [50, 200, 1000] as const;
/** Poll cadence for the live tail; serve also caps follow at 600s. */
const LIVE_POLL_MS = 1500;

interface LogTailProps {
  itemId: string;
}

/**
 * NDJSON log tail for one run (serve `GET /runs/{id}/logs?tail=N`).
 * Live mode re-fetches the tail on a fixed cadence — near-real-time
 * without a long-lived stream over IPC.
 */
const LogTail: React.FC<LogTailProps> = ({ itemId }) => {
  const { t } = useTranslation('common');
  const fetchLogs = useOrchestratorStore((s) => s.fetchLogs);
  const [lines, setLines] = useState<string[]>([]);
  const [tailSize, setTailSize] = useState<number>(200);
  const [live, setLive] = useState(false);
  const [missing, setMissing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

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

  useEffect(() => {
    // Fetch-on-mount: all state updates happen after the await inside
    // `refresh`; the conservative hook rule cannot see through the
    // useCallback chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void refresh(), LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  useEffect(() => {
    if (live && stickToBottom.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, live]);

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
          onClick={() => setLive((value) => !value)}
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
