import { useCallback, useState } from 'react';
import type { SelectorTestResult } from '../../../types/ipc-contracts';

interface UseSelectorTestResult {
  result: SelectorTestResult | null;
  isLoading: boolean;
  test: (selector: string) => Promise<void>;
}

export function useSelectorTest(mode: 'web' | 'desktop' = 'web'): UseSelectorTestResult {
  const [result, setResult] = useState<SelectorTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const test = useCallback(async (selector: string) => {
    if (!selector.trim()) {
      setResult(null);
      return;
    }
    setIsLoading(true);
    try {
      const method = mode === 'desktop' ? 'testDesktopSelector' : 'testSelector';
      const res = await window.rpaforge?.bridge.send(method, { selector });
      setResult(res ?? null);
    } catch {
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  return { result, isLoading, test };
}
