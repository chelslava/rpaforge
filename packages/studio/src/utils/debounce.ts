/**
 * Debounce utility for optimizing frequent state updates.
 * Reduces the number of function calls by delaying execution.
 */

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Creates a debounced version of the provided function.
 * The debounced function delays invoking `fn` until `delay` milliseconds
 * have elapsed since the last invocation.
 *
 * @param fn - The function to debounce
 * @param delay - Milliseconds to wait before invoking
 * @returns Debounced function with same signature
 */
export function debounce<T extends AnyFunction>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };

  return debounced as T;
}

/**
 * Creates a debounced version that also cancels any pending invocation
 * when the returned cancel function is called.
 */
export function debounceWithCancel<T extends AnyFunction>(
  fn: T,
  delay: number
): { debounced: T; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const debounced = (...args: Parameters<T>) => {
    cancel();
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };

  return {
    debounced: debounced as T,
    cancel,
  };
}
