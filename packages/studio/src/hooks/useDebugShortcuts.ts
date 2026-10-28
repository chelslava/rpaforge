import { useEffect, useRef } from 'react';

export const DEBUG_SHORTCUTS = {
  STEP_OVER: { key: 'F10', shift: false, description: 'Step over (while paused)' },
  STEP_INTO: { key: 'F11', shift: false, description: 'Step into (while paused)' },
  STEP_OUT: { key: 'F11', shift: true, description: 'Step out (Shift+F11, while paused)' },
  CONTINUE: { key: 'F5', description: 'Continue execution (while paused)' },
};

export interface DebugShortcutsHandlers {
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onContinue: () => void;
}

export interface DebugShortcutsOptions {
  /** Stepping controls only act while the engine is paused at a breakpoint. */
  isPaused: boolean;
  /** Guards against double-dispatch while a step request is in flight. */
  isStepLoading: boolean;
}

/**
 * Global debugger keyboard shortcuts: F10 step over, F11 step into,
 * Shift+F11 step out, F5 continue. Active only while paused, so the
 * shortcuts never race a running process or fire during a step request.
 */
export function useDebugShortcuts(
  handlers: DebugShortcutsHandlers,
  options: DebugShortcutsOptions,
): void {
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);

  useEffect(() => {
    handlersRef.current = handlers;
    optionsRef.current = options;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { isPaused, isStepLoading } = optionsRef.current;
      if (!isPaused || isStepLoading) return;

      const activeHandlers = handlersRef.current;
      if (event.key === 'F5') {
        event.preventDefault();
        activeHandlers.onContinue();
      } else if (event.key === 'F10') {
        event.preventDefault();
        activeHandlers.onStepOver();
      } else if (event.key === 'F11' && event.shiftKey) {
        event.preventDefault();
        activeHandlers.onStepOut();
      } else if (event.key === 'F11') {
        event.preventDefault();
        activeHandlers.onStepInto();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export default useDebugShortcuts;
