import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiAutoFillResult } from '../types/ai';
import { createLogger } from '../utils/logger';

const logger = createLogger('useAiParamFill');

export interface UseAiParamFillParams {
  activityId: string;
  activityName: string;
  activityCategory: string;
  params: Array<{ name: string; type: string; required: boolean; defaultValue?: string }>;
  variables: Array<{ name: string; type: string; value?: string }>;
  previousActivities: Array<{ name: string; activityId: string; outputs: string[] }>;
  enabled: boolean;
}

export interface UseAiParamFillResult {
  suggestedValues: Record<string, string>;
  isLoading: boolean;
  acceptedParams: Set<string>;
  acceptSuggested: (paramName: string) => void;
  clearSuggestion: (paramName: string) => void;
  reset: () => void;
}

export function useAiParamFill({
  activityId,
  activityName,
  activityCategory,
  params,
  variables,
  previousActivities,
  enabled,
}: UseAiParamFillParams): UseAiParamFillResult {
  const [suggestedValues, setSuggestedValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedParams, setAcceptedParams] = useState<Set<string>>(new Set());
  const cacheRef = useRef<Record<string, Record<string, string>>>({});
  const activityRef = useRef(activityId);

  const acceptSuggested = useCallback((paramName: string) => {
    setAcceptedParams((prev) => new Set(prev).add(paramName));
  }, []);

  const clearSuggestion = useCallback((paramName: string) => {
    setSuggestedValues((prev) => {
      const next = { ...prev };
      delete next[paramName];
      return next;
    });
    setAcceptedParams((prev) => {
      const next = new Set(prev);
      next.delete(paramName);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSuggestedValues({});
    setIsLoading(false);
    setAcceptedParams(new Set());
  }, []);

  useEffect(() => {
    if (activityId !== activityRef.current) {
      activityRef.current = activityId;
      reset();
    }
  }, [activityId, reset]);

  useEffect(() => {
    if (!enabled || !activityId || !activityName || suggestedValues[Object.keys(suggestedValues)[0] || ''] !== undefined) {
      return;
    }

    const cacheKey = `${activityId}:${activityName}`;
    if (cacheRef.current[cacheKey]) {
      setSuggestedValues(cacheRef.current[cacheKey]);
      return;
    }

    const fetchSuggestions = async () => {
      if (!window.rpaforge?.ai.autoFillParams) return;

      setIsLoading(true);
      try {
        const result: AiAutoFillResult = await window.rpaforge.ai.autoFillParams({
          activityId,
          activityName,
          activityCategory,
          activityParams: params,
          variables,
          previousActivities,
        });
        if (result.suggestions && Object.keys(result.suggestions).length > 0) {
          cacheRef.current[cacheKey] = result.suggestions;
          setSuggestedValues(result.suggestions);
        }
      } catch (err) {
        logger.error('Failed to fetch AI param suggestions', err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSuggestions();
  }, [activityId, activityName, activityCategory, enabled, params, variables, previousActivities]);

  return { suggestedValues, isLoading, acceptedParams, acceptSuggested, clearSuggestion, reset };
}
