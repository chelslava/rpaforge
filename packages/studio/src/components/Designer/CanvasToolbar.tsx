import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  FiAlignLeft,
  FiAlignCenter,
  FiAlignRight,
  FiAlignJustify,
  FiMoreVertical,
  FiGrid,
  FiRotateCcw,
  FiRotateCw,
  FiInfo,
  FiMap,
  FiLayout,
  FiLoader,
  FiSearch,
  FiX,
  FiMaximize2,
  FiCrosshair,
} from 'react-icons/fi';
import { FaMinus, FaLongArrowAltRight } from 'react-icons/fa';
import { useReactFlow } from '@xyflow/react';
import { useBlockStore } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';

export type EdgeTypeOption = 'smoothstep' | 'step' | 'default' | 'bendable' | 'straight' | 'auto-route';
export type AlignmentType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
export type DistributionType = 'horizontal' | 'vertical';

interface CanvasToolbarProps {
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  edgeType: EdgeTypeOption;
  onChangeEdgeType: (type: EdgeTypeOption) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  onAutoLayout: () => void;
  isLayouting?: boolean;
  onZoomToFit?: () => void;
  onCenterView?: () => void;
  nodeSearch: string;
  onNodeSearchChange: (query: string) => void;
  nodeSearchMatchCount: number;
  nodeSearchTotalCount: number;
  onNavigateToFirstMatch: () => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  snapToGrid,
  onToggleSnapToGrid,
  edgeType,
  onChangeEdgeType,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showMiniMap,
  onToggleMiniMap,
  onAutoLayout,
  isLayouting = false,
  onZoomToFit,
  onCenterView,
  nodeSearch,
  onNodeSearchChange,
  nodeSearchMatchCount,
  nodeSearchTotalCount,
  onNavigateToFirstMatch,
}) => {
  const { t } = useTranslation('common');
  const { getNodes, setNodes, fitView, setCenter } = useReactFlow();
  const storeNodes = useBlockStore((state) => state.nodes);
  const storeEdges = useBlockStore((state) => state.edges);
  const updateNodePosition = useBlockStore((state) => state.updateNodePosition);
  const pushHistory = useHistoryStore((state) => state.pushHistory);
  const [showMore, setShowMore] = useState(false);
  const [showEdgeMenu, setShowEdgeMenu] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const edgeMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const EDGE_TYPE_OPTIONS = [
    { type: 'auto-route' as EdgeTypeOption, label: t('canvasToolbar.smartRouting').split(' ')[0], description: t('canvasToolbar.smartRouting') },
    { type: 'smoothstep' as EdgeTypeOption, label: t('canvasToolbar.roundedCorners').split(' ')[0], description: t('canvasToolbar.roundedCorners') },
    { type: 'step' as EdgeTypeOption, label: t('canvasToolbar.sharpCorners').split(' ')[0], description: t('canvasToolbar.sharpCorners') },
  ];

  const BLOCK_LEGEND = [
    { name: 'Start', description: t('canvasToolbar.entryPoint'), color: 'var(--color-block-start)' },
    { name: 'End', description: t('canvasToolbar.exitPoint'), color: 'var(--color-block-end)' },
    { name: 'If', description: t('canvasToolbar.decision'), color: 'var(--color-block-if)' },
    { name: 'Loop', description: t('canvasToolbar.repeat'), color: 'var(--color-block-while)' },
    { name: 'Try', description: t('canvasToolbar.errorHandling'), color: 'var(--color-block-error-handling)' },
    { name: 'Activity', description: t('canvasToolbar.action'), color: 'var(--color-block-sub-diagram)' },
  ];

  const handleZoomToFit = useCallback(() => {
    if (onZoomToFit) {
      onZoomToFit();
    } else {
      void fitView({ padding: 0.2, duration: 300 });
    }
  }, [onZoomToFit, fitView]);

  const handleCenterStartNode = useCallback(() => {
    if (onCenterView) {
      onCenterView();
    } else {
      const allNodes = getNodes();
      const startNode =
        allNodes.find(
          (n) =>
            n.type === 'start' ||
            n.id === 'start' ||
            (n.data as { blockType?: string } | undefined)?.blockType === 'start'
        ) || allNodes[0];
      if (startNode) {
        void setCenter(
          startNode.position.x + (startNode.measured?.width ?? 180) / 2,
          startNode.position.y + (startNode.measured?.height ?? 80) / 2,
          { zoom: 1, duration: 300 }
        );
      } else {
        void fitView({ padding: 0.2, duration: 300 });
      }
    }
  }, [onCenterView, getNodes, setCenter, fitView]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (edgeMenuRef.current && !edgeMenuRef.current.contains(e.target as Node)) {
        setShowEdgeMenu(false);
      }
    };
    if (showEdgeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEdgeMenu]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };

    document.addEventListener('keydown', handleFindShortcut);
    return () => document.removeEventListener('keydown', handleFindShortcut);
  }, []);

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  const currentEdgeType = EDGE_TYPE_OPTIONS.find(opt => opt.type === edgeType) || EDGE_TYPE_OPTIONS[0];

  const getSelectedNodes = useCallback(() => {
    return getNodes().filter((node) => node.selected);
  }, [getNodes]);

  const alignNodes = useCallback(
    (type: AlignmentType) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 2) {
        toast.warning(t('canvasToolbar.selectNodesToAlign'));
        return;
      }

      pushHistory(storeNodes, storeEdges);

      let positions: { id: string; position: { x: number; y: number } }[] = [];

      switch (type) {
        case 'left': {
          const minX = Math.min(...selectedNodes.map((n) => n.position.x));
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, x: minX },
          }));
          break;
        }
        case 'right': {
          const maxX = Math.max(
            ...selectedNodes.map((n) => n.position.x + (n.measured?.width ?? 0))
          );
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, x: maxX - (n.measured?.width ?? 0) },
          }));
          break;
        }
        case 'center-h': {
          const centerX =
            selectedNodes.reduce(
              (sum, n) => sum + n.position.x + (n.measured?.width ?? 0) / 2,
              0
            ) / selectedNodes.length;
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, x: centerX - (n.measured?.width ?? 0) / 2 },
          }));
          break;
        }
        case 'top': {
          const minY = Math.min(...selectedNodes.map((n) => n.position.y));
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, y: minY },
          }));
          break;
        }
        case 'bottom': {
          const maxY = Math.max(
            ...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0))
          );
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, y: maxY - (n.measured?.height ?? 0) },
          }));
          break;
        }
        case 'center-v': {
          const centerY =
            selectedNodes.reduce(
              (sum, n) => sum + n.position.y + (n.measured?.height ?? 0) / 2,
              0
            ) / selectedNodes.length;
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, y: centerY - (n.measured?.height ?? 0) / 2 },
          }));
          break;
        }
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          const newPos = positions.find((p) => p.id === node.id);
          return newPos ? { ...node, position: newPos.position } : node;
        })
      );

      positions.forEach(({ id, position }) => {
        updateNodePosition(id, position);
      });

      toast.success(t('canvasToolbar.alignedNodes', { count: selectedNodes.length }));
    },
    [getSelectedNodes, setNodes, updateNodePosition, pushHistory, storeNodes, storeEdges, t]
  );

  const distributeNodes = useCallback(
    (type: DistributionType) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 3) {
        toast.warning(t('canvasToolbar.selectNodesToDistribute'));
        return;
      }

      pushHistory(storeNodes, storeEdges);

      const sortedNodes = [...selectedNodes].sort((a, b) =>
        type === 'horizontal'
          ? a.position.x - b.position.x
          : a.position.y - b.position.y
      );

      const firstNode = sortedNodes[0];
      const lastNode = sortedNodes[sortedNodes.length - 1];

      const positions: { id: string; position: { x: number; y: number } }[] = [];

      if (type === 'horizontal') {
        const totalWidth = sortedNodes.reduce(
          (sum, n) => sum + (n.measured?.width ?? 0),
          0
        );
        const startX = firstNode.position.x;
        const endX = lastNode.position.x + (lastNode.measured?.width ?? 0);
        const availableSpace = endX - startX - totalWidth;
        const gap = availableSpace / (sortedNodes.length - 1);

        let currentX = startX;
        sortedNodes.forEach((node) => {
          positions.push({
            id: node.id,
            position: { ...node.position, x: currentX },
          });
          currentX += (node.measured?.width ?? 0) + gap;
        });
      } else {
        const totalHeight = sortedNodes.reduce(
          (sum, n) => sum + (n.measured?.height ?? 0),
          0
        );
        const startY = firstNode.position.y;
        const endY = lastNode.position.y + (lastNode.measured?.height ?? 0);
        const availableSpace = endY - startY - totalHeight;
        const gap = availableSpace / (sortedNodes.length - 1);

        let currentY = startY;
        sortedNodes.forEach((node) => {
          positions.push({
            id: node.id,
            position: { ...node.position, y: currentY },
          });
          currentY += (node.measured?.height ?? 0) + gap;
        });
      }

      setNodes((nodes) =>
        nodes.map((node) => {
          const newPos = positions.find((p) => p.id === node.id);
          return newPos ? { ...node, position: newPos.position } : node;
        })
      );

      positions.forEach(({ id, position }) => {
        updateNodePosition(id, position);
      });

      toast.success(
        t('canvasToolbar.distributedNodes', {
          count: selectedNodes.length,
          direction: type === 'horizontal' ? 'horizontally' : 'vertically',
        })
      );
    },
    [getSelectedNodes, setNodes, updateNodePosition, pushHistory, storeNodes, storeEdges, t]
  );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-ui-surface/95 backdrop-blur border border-ui-border rounded-lg shadow-lg p-1">
      {showSearch ? (
        <div className="flex items-center gap-1 bg-ui-surface-hover/80 rounded px-1.5 py-0.5 border border-ui-border">
          <FiSearch className="w-3.5 h-3.5 text-ui-text-muted" />
          <input
            ref={searchInputRef}
            value={nodeSearch}
            onChange={(event) => onNodeSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onNavigateToFirstMatch();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setShowSearch(false);
              }
            }}
            placeholder={t('canvasToolbar.searchNodesPlaceholder', 'Search nodes')}
            aria-label={t('canvasToolbar.searchNodes', 'Search nodes')}
            className="w-44 bg-transparent px-1 py-1 text-sm text-ui-text outline-none placeholder:text-ui-text-muted"
          />
          {nodeSearch && (
            <button
              onClick={() => onNodeSearchChange('')}
              className="p-1 rounded hover:bg-ui-surface-hover text-ui-text-muted"
              title={t('canvasToolbar.clearSearch', 'Clear search')}
              aria-label={t('canvasToolbar.clearSearch', 'Clear search')}
            >
              <FiX className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onNavigateToFirstMatch}
            disabled={!nodeSearchMatchCount}
            className="rounded px-1.5 py-0.5 text-xs text-ui-text-muted hover:bg-ui-surface-hover disabled:opacity-40"
            title={t('canvasToolbar.searchResults', '{{matches}} of {{total}} nodes match', { matches: nodeSearchMatchCount, total: nodeSearchTotalCount })}
            aria-label={t('canvasToolbar.searchResults', '{{matches}} of {{total}} nodes match', { matches: nodeSearchMatchCount, total: nodeSearchTotalCount })}
          >
            {nodeSearchMatchCount} / {nodeSearchTotalCount}
          </button>
          <button
            onClick={() => setShowSearch(false)}
            className="p-1 rounded hover:bg-ui-surface-hover text-ui-text-muted"
            aria-label={t('canvasToolbar.closeSearch', 'Close search')}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSearch(true)}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.searchNodes', 'Search nodes')}
          aria-label={t('canvasToolbar.searchNodes', 'Search nodes')}
        >
          <FiSearch className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center gap-0.5 border-r border-ui-border pr-1 mr-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text"
          title={t('canvasToolbar.undo')}
          aria-label={t('canvasToolbar.undo')}
        >
          <FiRotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text"
          title={t('canvasToolbar.redo')}
          aria-label={t('canvasToolbar.redo')}
        >
          <FiRotateCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-ui-border pr-1 mr-1">
        <button
          onClick={() => alignNodes('left')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.alignLeft')}
          aria-label={t('canvasToolbar.alignLeft')}
        >
          <FiAlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('center-h')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.alignCenterH')}
          aria-label={t('canvasToolbar.alignCenterH')}
        >
          <FiAlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('right')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.alignRight')}
          aria-label={t('canvasToolbar.alignRight')}
        >
          <FiAlignRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('top')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors rotate-[-90deg]"
          title={t('canvasToolbar.alignTop')}
          aria-label={t('canvasToolbar.alignTop')}
        >
          <FiAlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('center-v')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors rotate-[-90deg]"
          title={t('canvasToolbar.alignCenterV')}
          aria-label={t('canvasToolbar.alignCenterV')}
        >
          <FiAlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('bottom')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors rotate-[-90deg]"
          title={t('canvasToolbar.alignBottom')}
          aria-label={t('canvasToolbar.alignBottom')}
        >
          <FiAlignRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-ui-border pr-1 mr-1">
        <button
          onClick={() => distributeNodes('horizontal')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.distributeH')}
          aria-label={t('canvasToolbar.distributeH')}
        >
          <FiAlignJustify className="w-4 h-4" />
        </button>
        <button
          onClick={() => distributeNodes('vertical')}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors rotate-[-90deg]"
          title={t('canvasToolbar.distributeV')}
          aria-label={t('canvasToolbar.distributeV')}
        >
          <FiAlignJustify className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-ui-border pr-1 mr-1">
        <button
          onClick={onToggleSnapToGrid}
          className={`p-1.5 rounded transition-colors ${
            snapToGrid
              ? 'bg-library-builtin-soft text-ui-primary hover:bg-ui-surface-hover'
              : 'hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text'
          }`}
          title={snapToGrid ? t('canvasToolbar.disableGrid') : t('canvasToolbar.enableGrid')}
          aria-label={snapToGrid ? t('canvasToolbar.disableGrid') : t('canvasToolbar.enableGrid')}
          aria-pressed={snapToGrid}
        >
          <FiGrid className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleMiniMap}
          className={`p-1.5 rounded transition-colors ${
            showMiniMap
              ? 'bg-library-builtin-soft text-ui-primary hover:bg-ui-surface-hover'
              : 'hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text'
          }`}
          title={t('canvasToolbar.toggleMiniMap')}
          aria-label={t('canvasToolbar.toggleMiniMap')}
          aria-pressed={showMiniMap}
        >
          <FiMap className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomToFit}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={`${t('canvasToolbar.zoomToFit', 'Zoom to Fit')} (Ctrl+0 / Shift+1)`}
          aria-label={t('canvasToolbar.zoomToFit', 'Zoom to Fit')}
        >
          <FiMaximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleCenterStartNode}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={`${t('canvasToolbar.centerView', 'Center on Start Node')} (Home)`}
          aria-label={t('canvasToolbar.centerView', 'Center on Start Node')}
        >
          <FiCrosshair className="w-4 h-4" />
        </button>
        <button
          onClick={onAutoLayout}
          disabled={isLayouting}
          className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text"
          title={t('canvasToolbar.autoLayout')}
          aria-label={t('canvasToolbar.autoLayout')}
        >
          {isLayouting ? (
            <FiLoader className="w-4 h-4 animate-spin" />
          ) : (
            <FiLayout className="w-4 h-4" />
          )}
        </button>

        <div className="relative" ref={edgeMenuRef}>
          <button
            onClick={() => setShowEdgeMenu(!showEdgeMenu)}
            className="p-1.5 rounded transition-colors flex items-center gap-1 bg-library-builtin-soft text-ui-primary hover:bg-ui-surface-hover"
            title={t('canvasToolbar.lineStyle')}
            aria-label={t('canvasToolbar.lineStyle')}
          >
            {edgeType === 'step' ? <FaMinus className="w-4 h-4" /> : <FaLongArrowAltRight className="w-4 h-4" />}
            <span className="text-xs font-medium hidden lg:inline">{currentEdgeType.label}</span>
          </button>

          {showEdgeMenu && (
            <div className="absolute top-full left-0 mt-1 bg-ui-surface rounded-lg shadow-lg border border-ui-border py-1 min-w-[180px] z-50">
              {EDGE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  onClick={() => {
                    onChangeEdgeType(option.type);
                    setShowEdgeMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-ui-surface-hover flex items-center gap-2 ${
                    edgeType === option.type ? 'bg-library-builtin-soft text-ui-primary' : 'text-ui-text'
                  }`}
                >
                  <span className={`w-2 h-0.5 rounded ${
                    option.type === 'step' ? 'bg-ui-text-muted' : 'bg-ui-primary'
                  }`} />
                  <div>
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-ui-text-muted">{option.description}</div>
                  </div>
                  {edgeType === option.type && (
                    <span className="ml-auto text-ui-primary">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.blockLegend')}
          aria-label={t('canvasToolbar.blockLegend')}
        >
          <FiInfo className="w-4 h-4" />
        </button>
        {showLegend && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-ui-surface rounded-lg shadow-lg border border-ui-border p-3 z-50">
            <div className="text-xs font-semibold text-ui-text-muted uppercase mb-2">
              {t('canvasToolbar.blockTypes')}
            </div>
            <div className="space-y-1.5">
              {BLOCK_LEGEND.map((block) => (
                <div key={block.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: block.color }}
                  />
                  <span className="font-medium">{block.name}</span>
                  <span className="text-ui-text-muted">- {block.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowMore(!showMore)}
          className="p-1.5 rounded hover:bg-ui-surface-hover text-ui-text-muted hover:text-ui-text transition-colors"
          title={t('canvasToolbar.moreOptions')}
          aria-label={t('canvasToolbar.moreOptions')}
        >
          <FiMoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CanvasToolbar;
