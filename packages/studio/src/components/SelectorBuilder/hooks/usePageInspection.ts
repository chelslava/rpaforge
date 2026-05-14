import { useCallback, useState } from 'react';
import type { PageElement } from '../../../types/ipc-contracts';

interface UsePageInspectionResult {
  elements: PageElement[];
  isLoading: boolean;
  error: string | null;
  inspect: () => Promise<void>;
}

export function usePageInspection(mode: 'web' | 'desktop' = 'web'): UsePageInspectionResult {
  const [elements, setElements] = useState<PageElement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const method = mode === 'desktop' ? 'inspectDesktop' : 'inspectPage';
      const result = await window.rpaforge?.bridge.send(method, {});
      const data = result as { elements?: PageElement[] };
      setElements(data?.elements ?? []);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to inspect';
      const clean = raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      setError(clean || raw);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  return { elements, isLoading, error, inspect };
}
