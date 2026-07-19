/**
 * AI suggestions hook for RPAForge Studio (Issue #592).
 * Context-aware activity suggestions that appear when a user selects a node.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDiagramStore } from '../stores/diagramStore';
import { useVariableStore } from '../stores/variableStore';
import { useSettingsStore } from '../stores/settingsStore';
import { createLogger } from '../utils/logger';
import type { SuggestionItem } from '../types/ai';

const logger = createLogger('useAiSuggestions');

export interface UseAiSuggestionsResult {
  suggestions: SuggestionItem[];
  isThinking: boolean;
  clearSuggestions: () => void;
}

interface UseAiSuggestionsParams {
  selectedNodeId: string | null;
  nodes: Array<{ id: string; data: { blockData?: { type: string; id?: string; category?: string }; activity?: { id: string; category: string } } }>;
}

export const useAiSuggestions = ({ selectedNodeId, nodes }: UseAiSuggestionsParams): UseAiSuggestionsResult => {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get project ID and diagram ID from stores
  const projectId = useDiagramStore((state) => state.project?.id);
  const diagramId = useDiagramStore((state) => state.activeDiagramId);

  // Get variables from store and filter for this project/diagram
  // Track store changes to keep variables in sync
  const allVariables = useVariableStore((state) => state.variables);
  const relevantVariables = useMemo(
    () => allVariables
      .filter(v => v.projectId === projectId && (v.scope === 'process' || v.diagramId === diagramId))
      .map(v => ({ name: v.name, type: v.type })),
    [allVariables, projectId, diagramId]
  );

  // Build context and fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    if (!selectedNodeId) {
      setSuggestions([]);
      setIsThinking(false);
      return;
    }

    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    if (!selectedNode) {
      setSuggestions([]);
      return;
    }

    // Extract activity info from node
    const activityId = selectedNode.data.blockData?.id || selectedNode.data.activity?.id;
    const activityCategory = selectedNode.data.blockData?.category || selectedNode.data.activity?.category || '';

    if (!activityId || !activityCategory) {
      setSuggestions([]);
      return;
    }

    // Get process activities
    const processActivities = nodes
      .filter(n => n.id !== selectedNodeId)
      .map(n => ({
        id: n.data.blockData?.id || n.data.activity?.id || '',
        name: n.data.blockData?.id || n.data.activity?.id || '',
        category: n.data.blockData?.category || n.data.activity?.category || '',
      }))
      .filter(a => a.id);

    const ai = window.rpaforge?.ai;
    if (!ai) {
      logger.warn('AI bridge not available');
      setSuggestions([]);
      return;
    }

    setIsThinking(true);

    try {
      const result = await ai.getSuggestions({
        language: useSettingsStore.getState().language || 'en',
        selectedActivityId: activityId,
        selectedActivityCategory: activityCategory,
        processActivities,
        variables: relevantVariables,
      });
      setSuggestions(result.suggestions);
    } catch (err) {
      logger.error('Failed to fetch AI suggestions', err);
      setSuggestions([]);
    } finally {
      setIsThinking(false);
    }
  }, [selectedNodeId, nodes, relevantVariables, projectId]);

  // Ref to break the dep chain — avoids infinite loop when nodes/relevantVariables churn
  const fetchSuggestionsRef = useRef(fetchSuggestions);
  fetchSuggestionsRef.current = fetchSuggestions;

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!selectedNodeId) {
      setSuggestions([]);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      void fetchSuggestionsRef.current();
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [selectedNodeId]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setIsThinking(false);
  }, []);

  return { suggestions, isThinking, clearSuggestions };
};

export default useAiSuggestions;
