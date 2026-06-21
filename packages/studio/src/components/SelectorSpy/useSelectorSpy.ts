import { useState, useCallback } from 'react';
import type { PickedElement } from './types';

interface UseSelectorSpyResult {
  isCapturing: boolean;
  currentElement: PickedElement | null;
  error: string | null;
  startCapture: () => void;
  stopCapture: () => void;
  pickElement: (x: number, y: number) => Promise<PickedElement | null>;
}

export function useSelectorSpy(
  mode: 'web' | 'desktop',
): UseSelectorSpyResult {
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentElement, setCurrentElement] = useState<PickedElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCapture = useCallback(() => {
    setIsCapturing(true);
    setCurrentElement(null);
    setError(null);
  }, []);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);
  }, []);

  const pickElement = useCallback(async (x: number, y: number): Promise<PickedElement | null> => {
    setError(null);
    try {
      const method = mode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      const result = await window.rpaforge?.bridge.send(method, { x, y });

      if (result) {
        setCurrentElement(result);
        setIsCapturing(false);
        return result;
      }
      return null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to pick element';
      setError(errorMsg);
      setIsCapturing(false);
      return null;
    }
  }, [mode]);

  return {
    isCapturing,
    currentElement,
    error,
    startCapture,
    stopCapture,
    pickElement,
  };
}
