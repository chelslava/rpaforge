import { useCallback, useRef } from 'react';

export function useThrottledCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef<number>(0);
  const pendingArgs = useRef<Parameters<T> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttled = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall.current;

      if (timeSinceLastCall >= delay) {
        lastCall.current = now;
        callback(...args);
      } else {
        pendingArgs.current = args;

        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            if (pendingArgs.current) {
              lastCall.current = Date.now();
              callback(...pendingArgs.current);
              pendingArgs.current = null;
            }
            timeoutRef.current = null;
          }, delay - timeSinceLastCall);
        }
      }
    },
    [callback, delay]
  ) as unknown as T;

  return throttled;
}