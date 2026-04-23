import React, { useCallback, useEffect, useRef } from 'react';
import {
  FiCopy,
  FiScissors,
  FiTrash2,
  FiCornerUpRight,
  FiRepeat,
  FiCircle,
  FiPlay,
} from 'react-icons/fi';
import { useReactFlow } from '@reactflow/core';
import { useProcessStore } from '../../stores/processStore';
import { useDebuggerStore } from '../../stores/debuggerStore';

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface CanvasContextMenuProps {
  isOpen: boolean;
  position: ContextMenuPosition;
  nodeId: string | null;
  onClose: () => void;
  onRunFromNode?: (nodeId: string) => void;
  isRunning?: boolean;
}

const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  isOpen,
  position,
  nodeId,
  onClose,
  onRunFromNode,
  isRunning = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { getNode } = useReactFlow();
  const {
    copySelectedNodes,
    pasteNodes,
    cutSelectedNodes,
    duplicateSelectedNodes,
    removeNode,
    setSelectedNode,
  } = useProcessStore();
  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore();

  const node = nodeId ? getNode(nodeId) : null;
  const existingBreakpoint = node
    ? Array.from(breakpoints.values()).find((bp) => bp.nodeId === node.id || bp.file === node.id)
    : null;

  const isStartNode = node?.type === 'start';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleCopy = useCallback(() => {
    if (nodeId) {
      setSelectedNode(nodeId);
      copySelectedNodes();
    }
    onClose();
  }, [nodeId, copySelectedNodes, setSelectedNode, onClose]);

  const handleCut = useCallback(() => {
    if (nodeId) {
      setSelectedNode(nodeId);
      cutSelectedNodes();
    }
    onClose();
  }, [nodeId, cutSelectedNodes, setSelectedNode, onClose]);

  const handlePaste = useCallback(() => {
    pasteNodes();
    onClose();
  }, [pasteNodes, onClose]);

  const handleDuplicate = useCallback(() => {
    if (nodeId) {
      setSelectedNode(nodeId);
      duplicateSelectedNodes();
    }
    onClose();
  }, [nodeId, duplicateSelectedNodes, setSelectedNode, onClose]);

  const handleDelete = useCallback(() => {
    if (nodeId) {
      removeNode(nodeId);
    }
    onClose();
  }, [nodeId, removeNode, onClose]);

  const handleToggleBreakpoint = useCallback(() => {
    if (!node) return;

    if (existingBreakpoint) {
      removeBreakpoint(existingBreakpoint.id);
    } else {
      addBreakpoint({
        id: `bp-${node.id}-${Date.now()}`,
        file: node.id,
        line: 0,
        nodeId: node.id,
        enabled: true,
      });
    }
    onClose();
  }, [node, existingBreakpoint, addBreakpoint, removeBreakpoint, onClose]);

  const handleRunFromNode = useCallback(() => {
    if (nodeId && onRunFromNode) {
      onRunFromNode(nodeId);
    }
    onClose();
  }, [nodeId, onRunFromNode, onClose]);

  if (!isOpen) return null;

  const isOnNode = !!node;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 min-w-[160px]"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {isOnNode ? (
        <>
          {onRunFromNode && !isRunning && !isStartNode && (
            <>
              <button
                onClick={handleRunFromNode}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                <FiPlay className="w-4 h-4" />
                Run from Here
              </button>
              <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
            </>
          )}
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCopy className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={handleCut}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiScissors className="w-4 h-4" />
            Cut
          </button>
          <button
            onClick={handleDuplicate}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiRepeat className="w-4 h-4" />
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
          <button
            onClick={handleToggleBreakpoint}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCircle className={`w-4 h-4 ${existingBreakpoint ? 'fill-red-500 text-red-500' : ''}`} />
            {existingBreakpoint ? 'Remove Breakpoint' : 'Add Breakpoint'}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handlePaste}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCornerUpRight className="w-4 h-4" />
            Paste
          </button>
        </>
      )}
    </div>
  );
};

export default CanvasContextMenu;
