import { useEffect } from 'react';

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
};

export function useKeyboardShortcuts(
  handlers: Record<string, ((nodeId?: string) => void)>,
  options?: { nodes?: Array<{ id: string; position: { x: number; y: number } }>; selectedNodeId?: string }
): void {
  const { nodes = [], selectedNodeId } = options || {};

  useEffect(() => {
    const findNearestNode = (
      direction: 'up' | 'down' | 'left' | 'right',
      currentNodeId: string
    ): string | null => {
      const current = nodes.find((n) => n.id === currentNodeId);
      if (!current) return null;

      const currentPos = current.position;

      const candidates = nodes.filter((n) => {
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

      const isModKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isModKey && key === 'c') {
        event.preventDefault();
        handlers['copy']?.();
      } else if (isModKey && key === 'v') {
        event.preventDefault();
        handlers['paste']?.();
      } else if (isModKey && key === 'x') {
        event.preventDefault();
        handlers['cut']?.();
      } else if (isModKey && key === 'd') {
        event.preventDefault();
        handlers['duplicate']?.();
      } else if (isModKey && !event.shiftKey && key === 'z') {
        event.preventDefault();
        handlers['undo']?.();
      } else if (isModKey && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        handlers['redo']?.();
      } else if (event.key === ' ' && isModKey) {
        event.preventDefault();
        handlers['quickAdd']?.();
      } else if (event.key === 'Tab' && !isModKey && !event.shiftKey) {
        event.preventDefault();
        handlers['navNext']?.();
      } else if (event.key === 'Tab' && !isModKey && event.shiftKey) {
        event.preventDefault();
        handlers['navPrev']?.();
      } else if (event.key === 'Enter' && !isModKey) {
        handlers['navConfirm']?.();
      } else if (event.key === 'Escape') {
        handlers['navEscape']?.();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nearest = findNearestNode('up', selectedNodeId || '');
        if (nearest) handlers['navArrowUp']?.(nearest);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nearest = findNearestNode('down', selectedNodeId || '');
        if (nearest) handlers['navArrowDown']?.(nearest);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const nearest = findNearestNode('left', selectedNodeId || '');
        if (nearest) handlers['navArrowLeft']?.(nearest);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nearest = findNearestNode('right', selectedNodeId || '');
        if (nearest) handlers['navArrowRight']?.(nearest);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers, nodes, selectedNodeId]);
}
