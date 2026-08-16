import { useEffect, useRef } from 'react';

export const KEYBOARD_SHORTCUTS = {
  ARROW_UP: { key: 'ArrowUp', mod: false, description: 'Navigate to node above' },
  ARROW_DOWN: { key: 'ArrowDown', mod: false, description: 'Navigate to node below' },
  ARROW_LEFT: { key: 'ArrowLeft', mod: false, description: 'Navigate to node left' },
  ARROW_RIGHT: { key: 'ArrowRight', mod: false, description: 'Navigate to node right' },
  COPY: { key: 'c', mod: true, description: 'Copy selected node' },
  PASTE: { key: 'v', mod: true, description: 'Paste copied node(s)' },
  CUT: { key: 'x', mod: true, description: 'Cut selected node' },
  DUPLICATE: { key: 'd', mod: true, description: 'Duplicate selected node' },
  UNDO: { key: 'z', mod: true, shift: false, description: 'Undo last action' },
  REDO_Y: { key: 'y', mod: true, description: 'Redo last undone action' },
  REDO_Z: { key: 'z', mod: true, shift: true, description: 'Redo last undone action (Shift+Z)' },
  QUICK_ADD: { key: ' ', mod: true, description: 'Open quick-add activity palette' },
  NAV_NEXT: { key: 'Tab', mod: false, description: 'Select next canvas node' },
  NAV_PREV: { key: 'Tab', mod: false, shift: true, description: 'Select previous canvas node' },
  NAV_CONFIRM: { key: 'Enter', mod: false, description: 'Confirm selected node (focus properties)' },
  NAV_ESCAPE: { key: 'Escape', mod: false, description: 'Clear canvas selection' },
  COMMAND_PALETTE: { key: 'k', mod: true, description: 'Open command palette (Ctrl+K / Ctrl+P)' },
  HELP: { key: 'F1', mod: false, description: 'Open keyboard shortcuts and help' },
};

export function useKeyboardShortcuts(
  handlers: Record<string, ((nodeId?: string) => void)>,
  options?: { nodes?: Array<{ id: string; position: { x: number; y: number } }>; selectedNodeId?: string }
): void {
  const { nodes = [], selectedNodeId } = options || {};

  const handlersRef = useRef(handlers);
  const nodesRef = useRef(nodes);
  const selectedNodeIdRef = useRef(selectedNodeId);

  useEffect(() => {
    handlersRef.current = handlers;
    nodesRef.current = nodes;
    selectedNodeIdRef.current = selectedNodeId;
  });

  useEffect(() => {
    const findNearestNode = (
      direction: 'up' | 'down' | 'left' | 'right',
      currentNodeId: string
    ): string | null => {
      const currentNodes = nodesRef.current;
      const current = currentNodes.find((n) => n.id === currentNodeId);
      if (!current) return null;

      const currentPos = current.position;

      const candidates = currentNodes.filter((n) => {
        if (n.id === currentNodeId) return false;
        switch (direction) {
          case 'up':
            return n.position.y < currentPos.y - 10;
          case 'down':
            return n.position.y > currentPos.y + 10;
          case 'left':
            return n.position.x < currentPos.x - 10;
          case 'right':
            return n.position.x > currentPos.x + 10;
        }
      });

      if (candidates.length === 0) return null;

      const sorted = candidates.sort((a, b) => {
        const distA = Math.hypot(a.position.x - currentPos.x, a.position.y - currentPos.y);
        const distB = Math.hypot(b.position.x - currentPos.x, b.position.y - currentPos.y);
        return distA - distB;
      });

      return sorted[0].id || null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const inFormField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (inFormField) {
        return;
      }

      const activeHandlers = handlersRef.current;
      const currentSelectedNodeId = selectedNodeIdRef.current;
      const isModKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isModKey && (key === 'k' || key === 'p')) {
        event.preventDefault();
        activeHandlers['commandPalette']?.();
      } else if (event.key === 'F1') {
        event.preventDefault();
        activeHandlers['help']?.();
      } else if (isModKey && key === 'c') {
        event.preventDefault();
        activeHandlers['copy']?.();
      } else if (isModKey && key === 'v') {
        event.preventDefault();
        activeHandlers['paste']?.();
      } else if (isModKey && key === 'x') {
        event.preventDefault();
        activeHandlers['cut']?.();
      } else if (isModKey && key === 'd') {
        event.preventDefault();
        activeHandlers['duplicate']?.();
      } else if (isModKey && !event.shiftKey && key === 'z') {
        event.preventDefault();
        activeHandlers['undo']?.();
      } else if (isModKey && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        activeHandlers['redo']?.();
      } else if (event.key === ' ' && isModKey) {
        event.preventDefault();
        activeHandlers['quickAdd']?.();
      } else if (event.key === 'Tab' && !isModKey && !event.shiftKey) {
        event.preventDefault();
        activeHandlers['navNext']?.();
      } else if (event.key === 'Tab' && !isModKey && event.shiftKey) {
        event.preventDefault();
        activeHandlers['navPrev']?.();
      } else if (event.key === 'Enter' && !isModKey) {
        activeHandlers['navConfirm']?.();
      } else if (event.key === 'Escape') {
        activeHandlers['navEscape']?.();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nearest = findNearestNode('up', currentSelectedNodeId || '');
        if (nearest) activeHandlers['navArrowUp']?.(nearest);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nearest = findNearestNode('down', currentSelectedNodeId || '');
        if (nearest) activeHandlers['navArrowDown']?.(nearest);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const nearest = findNearestNode('left', currentSelectedNodeId || '');
        if (nearest) activeHandlers['navArrowLeft']?.(nearest);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nearest = findNearestNode('right', currentSelectedNodeId || '');
        if (nearest) activeHandlers['navArrowRight']?.(nearest);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
