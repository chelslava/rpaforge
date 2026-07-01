/**
 * AI diagram generation (E1 Phase 5.3). Kept separate from useFileOperations
 * — its lifecycle (in-flight request tracking, cancel, provider status) does
 * not fit the save/open/import shape of that hook. Talks to the Electron
 * main process via window.rpaforge.ai; the IPC layer has already run the
 * 3-layer validation (see electron/ai/generateDiagram.ts) by the time a
 * result comes back, so this hook only resolves activityId -> live Activity
 * (buildDiagramFromAiResult) and computes layout, mirroring the Mermaid
 * import pipeline in useFileOperations.importMermaid. Applying the result to
 * the canvas is a separate, explicit step (useFileOperations.applyAiDiagram)
 * so the caller can show an Apply/Discard preview first.
 */

import { useCallback, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { useEngine } from './useEngine';
import { computeAutoLayout } from '../canvas/autoLayout';
import { buildDiagramFromAiResult } from '../utils/aiDiagramBuilder';
import { normalizeActivitiesResult } from '../domain/activity';
import type { ProcessNode } from '../stores/blockStore';
import type { AiActivitySnapshot, AiProviderId, AiProviderStatus, AiProgressEvent } from '../types/ai';
import { createLogger } from '../utils/logger';
import { useSettingsStore } from '../stores/settingsStore';

const logger = createLogger('useAiGeneration');

export interface AiGeneratePreview {
  nodes: ProcessNode[];
  edges: Edge[];
  warnings: string[];
  /** Distinct variable names the diagram introduces (assign targets, for-each items, activity outputVariable) — not yet declared in the Variables panel. */
  variableNames: string[];
}

export interface AiGenerateOutcome {
  success: boolean;
  preview?: AiGeneratePreview;
  errors?: string[];
}

export interface UseAiGenerationResult {
  isGenerating: boolean;
  progressSteps: AiProgressEvent[];
  providerStatus: AiProviderStatus[];
  refreshProviderStatus: () => Promise<void>;
  generate: (prompt: string, providerId: AiProviderId) => Promise<AiGenerateOutcome>;
  cancel: () => void;
}

export const useAiGeneration = (): UseAiGenerationResult => {
  const { getActivities } = useEngine();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressSteps, setProgressSteps] = useState<AiProgressEvent[]>([]);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus[]>([]);
  const requestIdRef = useRef<string | null>(null);

  const refreshProviderStatus = useCallback(async () => {
    try {
      const status = await window.rpaforge?.ai.getProviderStatus();
      setProviderStatus(status ?? []);
    } catch (err) {
      logger.error('Failed to fetch AI provider status', err);
    }
  }, []);

  const generate = useCallback(
    async (prompt: string, providerId: AiProviderId): Promise<AiGenerateOutcome> => {
      const ai = window.rpaforge?.ai;
      if (!ai) {
        return { success: false, errors: ['AI bridge is not available.'] };
      }

      setIsGenerating(true);
      setProgressSteps([]);
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;

      const unsubscribeProgress = ai.onProgress((event) => {
        setProgressSteps((prev) => [...prev, event]);
      });

      try {
        const activitiesResult = normalizeActivitiesResult(await getActivities());
        const activitySnapshots: AiActivitySnapshot[] = activitiesResult.activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          category: activity.category,
          description: activity.description,
          hasOutput: activity.has_output,
          outputDescription: activity.output_description || undefined,
          params: activity.params.map((param) => ({
            name: param.name,
            type: param.type,
            required: param.required,
            hasDefault: param.default !== undefined,
          })),
        }));

        const result = await ai.generateDiagram({
          requestId,
          providerId,
          prompt,
          activities: activitySnapshots,
          language: useSettingsStore.getState().language || 'en',
        });

        if (!result.success || !result.diagram) {
          return { success: false, errors: result.errors ?? ['Generation failed.'] };
        }

        const built = buildDiagramFromAiResult(result.diagram, activitiesResult.activities);
        const positions = await computeAutoLayout(built.nodes, built.edges);
        const positionedNodes = built.nodes.map((node) => {
          const positioned = positions.find((p) => p.id === node.id);
          return positioned ? { ...node, position: positioned.position } : node;
        });

        return {
          success: true,
          preview: {
            nodes: positionedNodes,
            edges: built.edges,
            warnings: built.warnings,
            variableNames: built.variableNames,
          },
        };
      } catch (err) {
        logger.error('AI diagram generation failed', err);
        return { success: false, errors: [err instanceof Error ? err.message : String(err)] };
      } finally {
        unsubscribeProgress();
        setIsGenerating(false);
        requestIdRef.current = null;
      }
    },
    [getActivities]
  );

  const cancel = useCallback(() => {
    if (requestIdRef.current) {
      void window.rpaforge?.ai.cancelGenerate(requestIdRef.current);
    }
  }, []);

  return { isGenerating, progressSteps, providerStatus, refreshProviderStatus, generate, cancel };
};

export default useAiGeneration;
