import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { FiSend, FiTrash2, FiX } from 'react-icons/fi';
import type { Edge, Node } from '@xyflow/react';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { buildAssistantContext } from '../../utils/assistantContext';
import { applyProposals } from '../../utils/diagnosisProposals';
import { diffDiagrams, isDiffEmpty, type DiagramDocLike } from '../../utils/diagramDiff';
import { createLogger } from '../../utils/logger';
import type {
  AiAssistantChatResult,
  AssistantMessage,
} from '../../types/ai';
import DiagramDiffViewer from '../SourceControl/DiagramDiffViewer';

const logger = createLogger('AssistantPanel');

interface AssistantPanelProps {
  onClose: () => void;
}

/** One assistant turn that carried diagram edits awaiting review. */
interface TurnEdits {
  edits: NonNullable<AiAssistantChatResult['edits']>;
  base: { nodes: Node<ProcessNodeData>[]; edges: Edge[] };
  outcome: ReturnType<typeof applyProposals> | null;
}

const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: AssistantMessage;
}) {
  const { t } = useTranslation('common');
  const isUser = message.role === 'user';
  const usage =
    !isUser && message.tokenUsage
      ? ` · ${message.tokenUsage.total} tok${
          message.tokenUsage.costEstimate !== undefined
            ? ` · $${message.tokenUsage.costEstimate.toFixed(4)}`
            : ''
        }`
      : '';
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`assistant-message-${message.role}`}
    >
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-600/20 text-ui-text'
            : 'bg-ui-surface-inset text-ui-text'
        }`}
      >
        {message.content}
        {usage && (
          <span className="mt-1 block text-[10px] text-ui-text-muted" aria-label={t('assistant.tokenUsage')}>
            {usage}
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Conversational AI assistant dock (issue #903): multi-turn chat with
 * diagram context, streaming replies, and edit proposals applied as a
 * reviewed diff (same safe flow as AI diagnosis — no silent mutations).
 */
const AssistantPanel: React.FC<AssistantPanelProps> = ({ onClose }) => {
  const { t } = useTranslation('common');
  const nodes = useBlockStore(useShallow((state) => state.nodes));
  const edges = useBlockStore(useShallow((state) => state.edges));
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);
  const pushHistory = useHistoryStore((state) => state.pushHistory);

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [turnEdits, setTurnEdits] = useState<TurnEdits | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);

  const requestIdRef = useRef(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText]);

  const send = useCallback(async () => {
    const userMessage = draft.trim();
    if (!userMessage || streaming) return;
    setError(null);
    setDraft('');
    setApplied(false);
    setTurnEdits(null);
    const history = messages;
    setMessages((current) => [
      ...current,
      { role: 'user', content: userMessage },
    ]);
    setStreaming(true);
    setStreamText('');

    const unsubscribe = window.rpaforge?.ai.onAssistantProgress((event) => {
      if (event.requestId === requestIdRef.current) {
        setStreamText((current) => current + event.delta);
      }
    });

    try {
      const result: AiAssistantChatResult | undefined =
        await window.rpaforge?.ai.assistantChat({
          requestId: requestIdRef.current,
          providerId: 'openai-compatible',
          history,
          userMessage,
          context: buildAssistantContext(nodes, edges, selectedNodeId),
        });
      if (!result) {
        setError(t('assistant.errorUnavailable'));
        return;
      }
      if (result.consentRequired) {
        setError(t('assistant.consentRequired'));
        return;
      }
      if (!result.success || result.answer === undefined) {
        setError(
          result.errors?.join('; ') || t('assistant.errorGeneric')
        );
        return;
      }
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: result.answer ?? '',
          tokenUsage: result.tokenUsage,
          edits: result.edits,
        },
      ]);
      if (result.edits && result.edits.length > 0) {
        setTurnEdits({ edits: result.edits, base: { nodes, edges }, outcome: null });
      }
    } catch (err) {
      logger.error('assistantChat failed', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      unsubscribe?.();
      setStreaming(false);
      setStreamText('');
      requestIdRef.current = crypto.randomUUID();
    }
  }, [draft, streaming, messages, nodes, edges, selectedNodeId, t]);

  const reviewDiff = () => {
    if (!turnEdits) return;
    const outcome = applyProposals(turnEdits.base.nodes, turnEdits.base.edges, turnEdits.edits);
    setTurnEdits({ ...turnEdits, outcome });
    setShowDiff(true);
  };

  const confirmApply = () => {
    if (!turnEdits?.outcome) return;
    pushHistory(nodes, edges);
    setNodes(turnEdits.outcome.nodes);
    setEdges(turnEdits.outcome.edges);
    setShowDiff(false);
    setApplied(true);
    logger.info('Assistant edits applied', { count: turnEdits.outcome.applied.length });
  };

  const diffDocs = useMemo(() => {
    if (!showDiff || !turnEdits?.outcome) return null;
    return {
      base: {
        nodes: turnEdits.base.nodes,
        edges: turnEdits.base.edges,
      } as unknown as DiagramDocLike,
      target: {
        nodes: turnEdits.outcome.nodes,
        edges: turnEdits.outcome.edges,
      } as unknown as DiagramDocLike,
    };
  }, [showDiff, turnEdits]);

  const diffEmpty =
    diffDocs !== null && isDiffEmpty(diffDiagrams(diffDocs.base, diffDocs.target));

  return (
    <div
      className="flex h-full flex-col min-h-0"
      data-testid="assistant-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-center justify-between border-b border-ui-border px-3 py-2">
        <span className="text-sm font-medium">{t('assistant.title')}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setTurnEdits(null);
              setApplied(false);
              setError(null);
            }}
            className="text-ui-text-muted hover:text-ui-text"
            aria-label={t('assistant.clear')}
            disabled={streaming}
          >
            <FiTrash2 />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-ui-text-muted hover:text-ui-text"
            aria-label={t('assistant.close')}
          >
            <FiX />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto min-h-0 p-3" aria-live="polite">
        {messages.length === 0 && !streaming && (
          <p className="text-xs text-ui-text-muted" data-testid="assistant-empty">
            {t('assistant.empty')}
          </p>
        )}
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {streaming && (
          <div className="flex justify-start" data-testid="assistant-streaming">
            <div className="max-w-[90%] rounded-lg bg-ui-surface-inset px-3 py-2 text-xs text-ui-text-muted whitespace-pre-wrap break-words" aria-live="polite">
              {streamText || t('assistant.working')}
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500" data-testid="assistant-error" aria-live="assertive">
            {error}
          </p>
        )}
        {applied && (
          <p className="text-xs text-green-500" data-testid="assistant-applied">
            {t('assistant.applied')}
          </p>
        )}
      </div>

      {turnEdits && !streaming && (
        <div className="border-t border-ui-border px-3 py-2" data-testid="assistant-edits">
          {applied ? (
            <span className="text-xs text-ui-text-muted">{t('assistant.editsApplied')}</span>
          ) : (
            <button
              type="button"
              onClick={reviewDiff}
              className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs text-white hover:opacity-90"
            >
              {t('assistant.reviewDiff', { count: turnEdits.edits.length })}
            </button>
          )}
        </div>
      )}

      <div className="border-t border-ui-border p-3">
        <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-ui-text-muted">
          <span className="rounded bg-ui-surface-inset px-1.5 py-0.5">
            {t('assistant.contextDiagram', { count: nodes.length })}
          </span>
          {selectedNodeId && (
            <span className="rounded bg-ui-surface-inset px-1.5 py-0.5">
              {t('assistant.contextSelection', { id: selectedNodeId })}
            </span>
          )}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={t('assistant.placeholder')}
            disabled={streaming}
            rows={2}
            className="min-h-0 flex-1 resize-none rounded border border-ui-border bg-ui-surface px-2 py-1.5 text-xs text-ui-text placeholder:text-ui-text-muted"
            aria-label={t('assistant.placeholder')}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={streaming || draft.trim().length === 0}
            className="rounded bg-blue-600 p-2 text-white hover:opacity-90 disabled:opacity-40"
            aria-label={t('assistant.send')}
          >
            <FiSend />
          </button>
        </div>
      </div>

      {diffDocs && (
        <div className="border-t border-ui-border p-3">
          <DiagramDiffViewer
            filePath="assistant"
            staged={false}
            onClose={() => setShowDiff(false)}
            baseDoc={diffDocs.base}
            targetDoc={diffDocs.target}
            title={t('assistant.diffTitle')}
          />
          {diffEmpty ? (
            <p className="mt-2 text-xs text-ui-text-muted">{t('assistant.diffNoChanges')}</p>
          ) : (
            <button
              type="button"
              onClick={confirmApply}
              className="mt-2 w-full rounded bg-green-600 px-2 py-1.5 text-xs text-white hover:opacity-90"
              data-testid="assistant-confirm-apply"
            >
              {t('assistant.apply')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AssistantPanel;
