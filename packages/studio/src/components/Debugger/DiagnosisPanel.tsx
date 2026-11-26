import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { FiCpu, FiCheck, FiLoader, FiX } from 'react-icons/fi';
import type { Edge, Node } from '@xyflow/react';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useEngine } from '../../hooks/useEngine';
import { normalizeActivitiesResult } from '../../types/engine';
import { applyProposals, proposalTargetId } from '../../utils/diagnosisProposals';
import { diffDiagrams, isDiffEmpty, type DiagramDocLike } from '../../utils/diagramDiff';
import { createLogger } from '../../utils/logger';
import type {
  AiDiagnoseFailureRequest,
  AiDiagnoseFailureResult,
  DiagnosisResult,
} from '../../types/ai';
import DiagramDiffViewer from '../SourceControl/DiagramDiffViewer';

const logger = createLogger('DiagnosisPanel');

/** Minimal failed-run context the panel diagnoses (audit RunRecord subset). */
export interface DiagnosisRunContext {
  run_id?: string;
  process_name?: string;
  status?: string;
  error?: string | null;
  steps?: Array<{
    activity?: string;
    node_id?: string;
    status?: string;
    duration_ms?: number;
    inputs?: Record<string, unknown>;
    error?: string | null;
  }>;
}

interface DiagnosisPanelProps {
  run: DiagnosisRunContext;
  onClose: () => void;
}

type Phase = 'idle' | 'diagnosing' | 'result' | 'applied';

interface ApplyOutcome {
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  skippedReasons: string[];
  appliedCount: number;
}

/**
 * "Diagnose with AI" flow for one failed run (issue #906):
 * diagnose → typed proposals → deterministic apply → diagram diff →
 * confirm into the designer (with undo via the history store).
 */
export function DiagnosisPanel({ run, onClose }: DiagnosisPanelProps) {
  const { t } = useTranslation('common');
  const nodes = useBlockStore(useShallow((state) => state.nodes));
  const edges = useBlockStore(useShallow((state) => state.edges));
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const pushHistory = useHistoryStore((state) => state.pushHistory);
  const { getActivities } = useEngine();

  const [phase, setPhase] = useState<Phase>('idle');
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [skippedReasons, setSkippedReasons] = useState<string[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [diffDocs, setDiffDocs] = useState<{
    base: DiagramDocLike;
    target: DiagramDocLike;
  } | null>(null);
  const pendingApply = useRef<ApplyOutcome | null>(null);

  const requestId = useMemo(() => crypto.randomUUID(), []);

  const startDiagnosis = async () => {
    setPhase('diagnosing');
    setErrors([]);
    const request: AiDiagnoseFailureRequest = {
      requestId,
      providerId: 'openai-compatible',
      runRecord: run,
      diagram: {
        nodes: nodes.map((node) => ({ id: node.id, data: node.data as Record<string, unknown> })),
        edges,
      },
    };
    try {
      const result: AiDiagnoseFailureResult | undefined =
        await window.rpaforge?.ai.diagnoseFailure(request);
      if (!result) {
        setErrors([t('diagnosis.failedGeneric')]);
        setPhase('idle');
        return;
      }
      if (result.consentRequired) {
        setErrors([t('diagnosis.consentRequired')]);
        setPhase('idle');
        return;
      }
      if (!result.success || !result.diagnosis) {
        setErrors(result.errors ?? [t('diagnosis.failedGeneric')]);
        setPhase('idle');
        return;
      }
      setDiagnosis(result.diagnosis);
      setSelected(new Set(result.diagnosis.proposals.map((_, index) => index)));
      setPhase('result');
    } catch (error) {
      logger.error('Diagnosis call failed', error);
      setErrors([error instanceof Error ? error.message : String(error)]);
      setPhase('idle');
    }
  };

  const previewDiff = async () => {
    if (!diagnosis) return;
    const chosen = diagnosis.proposals.filter((_, index) => selected.has(index));
    let activitiesSnapshot: Awaited<
      ReturnType<typeof normalizeActivitiesResult>
    >['activities'] = [];
    try {
      // Best-effort: the registry snapshot powers insert_precondition
      // resolution; an unavailable engine skips those proposals gracefully.
      activitiesSnapshot = normalizeActivitiesResult(await getActivities()).activities;
    } catch {
      activitiesSnapshot = [];
    }
    const result = applyProposals(nodes, edges, chosen, {
      resolveActivity: (library, activityName) =>
        activitiesSnapshot.find(
          (activity) =>
            activity.library === library &&
            (activity.name === activityName || activity.id === `${library}.${activityName}`)
        ),
    });

    pendingApply.current = {
      nodes: result.nodes,
      edges: result.edges,
      appliedCount: result.applied.length,
      skippedReasons: result.skipped.map(
        (skip) => `${skip.reason} (${proposalTargetId(skip.proposal)})`
      ),
    };
    setSkippedReasons(pendingApply.current.skippedReasons);
    setDiffDocs({
      base: { nodes, edges } as unknown as DiagramDocLike,
      target: { nodes: result.nodes, edges: result.edges } as unknown as DiagramDocLike,
    });
    setShowDiff(true);
  };

  const confirmApply = () => {
    const outcome = pendingApply.current;
    if (!outcome) return;
    pushHistory(nodes, edges);
    setNodes(outcome.nodes);
    setEdges(outcome.edges);
    setShowDiff(false);
    setPhase('applied');
    logger.info('Diagnosis proposals applied', { applied: outcome.appliedCount });
  };

  const diffEmpty =
    diffDocs !== null &&
    isDiffEmpty(diffDiagrams(diffDocs.base, diffDocs.target));

  const confidenceColor =
    diagnosis?.confidence === 'high'
      ? 'text-green-500'
      : diagnosis?.confidence === 'medium'
        ? 'text-yellow-500'
        : 'text-ui-text-muted';

  return (
    <div className="border border-ui-border rounded-lg p-3 space-y-3 bg-ui-bg-surface" data-testid="diagnosis-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiCpu className="text-ui-text-muted" />
          <span className="text-sm font-medium">{t('diagnosis.title')}</span>
        </div>
        <button onClick={onClose} className="text-ui-text-muted hover:text-ui-text" aria-label={t('close')}>
          <FiX />
        </button>
      </div>

      {phase === 'idle' && (
        <div className="space-y-2">
          {errors.length > 0 && (
            <ul className="text-xs text-red-500 space-y-1" data-testid="diagnosis-errors">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <button
            onClick={startDiagnosis}
            className="w-full text-xs px-2 py-1.5 rounded bg-blue-600 text-white hover:opacity-90"
          >
            {t('diagnosis.diagnoseButton')}
          </button>
        </div>
      )}

      {phase === 'diagnosing' && (
        <div className="flex items-center gap-2 text-xs text-ui-text-muted" data-testid="diagnosis-progress">
          <FiLoader className="animate-spin" />
          {t('diagnosis.diagnosing')}
          <button
            className="ml-auto text-ui-text-muted hover:text-ui-text underline"
            onClick={() => void window.rpaforge?.ai.cancelDiagnose(requestId)}
          >
            {t('diagnosis.cancel')}
          </button>
        </div>
      )}

      {phase === 'result' && diagnosis && (
        <div className="space-y-2" data-testid="diagnosis-result">
          <div className="text-xs space-y-1">
            <div className="font-medium">{diagnosis.root_cause}</div>
            <div className={`${confidenceColor} uppercase text-[10px]`}>
              {t('diagnosis.confidence')}: {t(`diagnosis.confidence_${diagnosis.confidence}`)}
            </div>
            {diagnosis.explanation && (
              <p className="text-ui-text-muted">{diagnosis.explanation}</p>
            )}
          </div>

          {diagnosis.proposals.length > 0 && (
            <ul className="space-y-1" data-testid="diagnosis-proposals">
              {diagnosis.proposals.map((proposal, index) => (
                <li key={index} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(index);
                      else next.delete(index);
                      setSelected(next);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    {t(`diagnosis.proposal_${proposal.type}`)} →{' '}
                    <span className="font-mono">{proposalTargetId(proposal)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {skippedReasons.length > 0 && (
            <ul className="text-[10px] text-yellow-600 space-y-0.5" data-testid="diagnosis-skipped">
              {skippedReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}

          {errors.length > 0 && (
            <ul className="text-xs text-red-500 space-y-1">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          {diagnosis.proposals.length > 0 && (
            <button
              onClick={previewDiff}
              disabled={selected.size === 0}
              className="w-full text-xs px-2 py-1.5 rounded bg-blue-600 text-white hover:opacity-90 disabled:opacity-40"
            >
              {t('diagnosis.previewDiff')}
            </button>
          )}
        </div>
      )}

      {phase === 'applied' && (
        <div className="flex items-center gap-2 text-xs text-green-500" data-testid="diagnosis-applied">
          <FiCheck />
          {t('diagnosis.appliedWithUndo')}
        </div>
      )}

      {showDiff && diffDocs && (
        <div className="space-y-2">
          <DiagramDiffViewer
            filePath={run.process_name ?? 'diagnosis'}
            staged={false}
            onClose={() => setShowDiff(false)}
            baseDoc={diffDocs.base}
            targetDoc={diffDocs.target}
            title={t('diagnosis.diffTitle')}
          />
          {diffEmpty ? (
            <p className="text-xs text-ui-text-muted">{t('diagnosis.diffNoChanges')}</p>
          ) : (
            <button
              onClick={confirmApply}
              className="w-full text-xs px-2 py-1.5 rounded bg-green-600 text-white hover:opacity-90"
              data-testid="diagnosis-confirm-apply"
            >
              {t('diagnosis.applyToDiagram')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
