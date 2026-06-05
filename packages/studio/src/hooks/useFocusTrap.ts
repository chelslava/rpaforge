import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement = HTMLElement>(isOpen: boolean): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      containerRef.current.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      // Let an embedded Monaco editor own Tab navigation within its own widgets
      // (find/replace inputs, suggestions). Trapping Tab globally fights Monaco's
      // internal focus management and can wedge the find widget.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.monaco-editor')) {
        return;
      }

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, getFocusableElements]);

  return containerRef;
}
