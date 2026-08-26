import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCopy,
  FiScissors,
  FiTrash2,
  FiCornerUpRight,
  FiRepeat,
  FiCircle,
  FiPlay,
  FiMapPin,
} from 'react-icons/fi';
import { useReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { useBlockStore } from '../../stores/blockStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useHistoryStore } from '../../stores/historyStore';

interface CanvasContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
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
  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore();
  const { t } = useTranslation('common');

  const storeNodes = useBlockStore(useShallow((state) => state.nodes));
  const storeEdges = useBlockStore(useShallow((state) => state.edges));
  const updateNode = useBlockStore((state) => state.updateNode);
  const addNode = useBlockStore((state) => state.addNode);
  const addEdge = useBlockStore((state) => state.addEdge);
  const removeNode = useBlockStore((state) => state.removeNode);
  const copyNodes = useBlockStore((state) => state.copyNodes);
  const pasteNodes = useBlockStore((state) => state.pasteNodes);
  const duplicateNodes = useBlockStore((state) => state.duplicateNodes);
  const pushHistory = useHistoryStore((state) => state.pushHistory);
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode);

  const isPinned = nodeId
    ? (storeNodes.find((n) => n.id === nodeId)?.data?.pinned ?? false)
    : false;

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
      copyNodes([nodeId]);
    }
    onClose();
  }, [nodeId, copyNodes, setSelectedNode, onClose]);

  const handleCut = useCallback(() => {
    if (nodeId) {
      setSelectedNode(nodeId);
      copyNodes([nodeId]);
      pushHistory(storeNodes, storeEdges);
      removeNode(nodeId);
    }
    onClose();
  }, [nodeId, copyNodes, pushHistory, storeNodes, storeEdges, removeNode, setSelectedNode, onClose]);

  const handlePaste = useCallback(() => {
    const { nodes: newNodes, edges: newEdges } = pasteNodes();
    if (newNodes.length > 0) {
      pushHistory(storeNodes, storeEdges);
      for (const n of newNodes) {
        addNode(n);
      }
      for (const e of newEdges) {
        addEdge(e);
      }
      setSelectedNode(newNodes[0].id);
    }
    onClose();
  }, [pasteNodes, pushHistory, storeNodes, storeEdges, addNode, addEdge, setSelectedNode, onClose]);

  const handleDuplicate = useCallback(() => {
    if (nodeId) {
      setSelectedNode(nodeId);
      const { nodes: newNodes, edges: newEdges } = duplicateNodes([nodeId]);
      if (newNodes.length > 0) {
        pushHistory(storeNodes, storeEdges);
        for (const n of newNodes) {
          addNode(n);
        }
        for (const e of newEdges) {
          addEdge(e);
        }
        setSelectedNode(newNodes[0].id);
      }
    }
    onClose();
  }, [nodeId, duplicateNodes, pushHistory, storeNodes, storeEdges, addNode, addEdge, setSelectedNode, onClose]);

  const handleDelete = useCallback(() => {
    if (nodeId) {
      pushHistory(storeNodes, storeEdges);
      removeNode(nodeId);
    }
    onClose();
  }, [nodeId, pushHistory, storeNodes, storeEdges, removeNode, onClose]);

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

  const handleTogglePinned = useCallback(() => {
    if (!nodeId) return;
    pushHistory(storeNodes, storeEdges);
    updateNode(nodeId, { pinned: !isPinned });
    onClose();
  }, [nodeId, isPinned, pushHistory, storeNodes, storeEdges, updateNode, onClose]);

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
                {t('canvas.contextMenu.runFromHere')}
              </button>
              <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
            </>
          )}
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCopy className="w-4 h-4" />
            {t('canvas.contextMenu.copy')}
          </button>
          <button
            onClick={handleCut}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiScissors className="w-4 h-4" />
            {t('canvas.contextMenu.cut')}
          </button>
          <button
            onClick={handleDuplicate}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiRepeat className="w-4 h-4" />
            {t('canvas.contextMenu.duplicate')}
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('canvas.contextMenu.delete')}
          </button>
          <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
          <button
            onClick={handleToggleBreakpoint}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCircle className={`w-4 h-4 ${existingBreakpoint ? 'fill-red-500 text-red-500' : ''}`} />
            {existingBreakpoint ? t('debugger.removeBreakpoint') : t('debugger.addBreakpoint')}
          </button>
          <button
            onClick={handleTogglePinned}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiMapPin className={`w-4 h-4 ${isPinned ? 'text-ui-primary fill-current' : ''}`} />
            {isPinned ? t('canvas.contextMenu.unpinPosition') : t('canvas.contextMenu.pinPosition')}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handlePaste}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FiCornerUpRight className="w-4 h-4" />
            {t('canvas.contextMenu.paste')}
          </button>
        </>
      )}
    </div>
  );
};

export default CanvasContextMenu;
