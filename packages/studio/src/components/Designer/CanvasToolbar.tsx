import React, { useCallback, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FiAlignLeft,
  FiAlignCenter,
  FiAlignRight,
  FiAlignJustify,
  FiMoreVertical,
  FiGrid,
} from 'react-icons/fi';
import { FaMinus, FaLongArrowAltRight } from 'react-icons/fa';
import { MdShowChart } from 'react-icons/md';
import { useReactFlow } from '@reactflow/core';
import { useProcessStore } from '../../stores/processStore';

export type EdgeTypeOption = 'default' | 'straight' | 'smoothstep' | 'bendable';
export type AlignmentType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
export type DistributionType = 'horizontal' | 'vertical';

interface CanvasToolbarProps {
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  edgeType: EdgeTypeOption;
  onToggleEdgeType: () => void;
}

const EDGE_TYPE_OPTIONS: { type: EdgeTypeOption; label: string; description: string }[] = [
  { type: 'smoothstep', label: 'Smoothstep', description: 'Lines with rounded corners' },
  { type: 'straight', label: 'Straight', description: 'Direct diagonal lines' },
  { type: 'bendable', label: 'Bendable', description: 'Custom route with draggable points' },
  { type: 'default', label: 'Bezier', description: 'Curved bezier lines' },
];

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  snapToGrid,
  onToggleSnapToGrid,
  edgeType,
  onToggleEdgeType,
}) => {
  const { getNodes, setNodes } = useReactFlow();
  const { updateNodePosition, pushHistory } = useProcessStore();
  const [showMore, setShowMore] = useState(false);
  const [showEdgeMenu, setShowEdgeMenu] = useState(false);
  const edgeMenuRef = useRef<HTMLDivElement>(null);

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

  const currentEdgeType = EDGE_TYPE_OPTIONS.find(opt => opt.type === edgeType) || EDGE_TYPE_OPTIONS[0];

  const getSelectedNodes = useCallback(() => {
    return getNodes().filter((node) => node.selected);
  }, [getNodes]);

  const alignNodes = useCallback(
    (type: AlignmentType) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 2) {
        toast.warning('Select at least 2 nodes to align');
        return;
      }

      pushHistory();

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
            ...selectedNodes.map((n) => n.position.x + (n.width ?? 0))
          );
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, x: maxX - (n.width ?? 0) },
          }));
          break;
        }
        case 'center-h': {
          const centerX =
            selectedNodes.reduce(
              (sum, n) => sum + n.position.x + (n.width ?? 0) / 2,
              0
            ) / selectedNodes.length;
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, x: centerX - (n.width ?? 0) / 2 },
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
            ...selectedNodes.map((n) => n.position.y + (n.height ?? 0))
          );
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, y: maxY - (n.height ?? 0) },
          }));
          break;
        }
        case 'center-v': {
          const centerY =
            selectedNodes.reduce(
              (sum, n) => sum + n.position.y + (n.height ?? 0) / 2,
              0
            ) / selectedNodes.length;
          positions = selectedNodes.map((n) => ({
            id: n.id,
            position: { ...n.position, y: centerY - (n.height ?? 0) / 2 },
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

      toast.success(`Aligned ${selectedNodes.length} nodes`);
    },
    [getSelectedNodes, setNodes, updateNodePosition, pushHistory]
  );

  const distributeNodes = useCallback(
    (type: DistributionType) => {
      const selectedNodes = getSelectedNodes();
      if (selectedNodes.length < 3) {
        toast.warning('Select at least 3 nodes to distribute');
        return;
      }

      pushHistory();

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
          (sum, n) => sum + (n.width ?? 0),
          0
        );
        const startX = firstNode.position.x;
        const endX = lastNode.position.x + (lastNode.width ?? 0);
        const gap = (endX - startX - totalWidth) / (sortedNodes.length - 1);

        let currentX = startX;
        sortedNodes.forEach((node) => {
          positions.push({
            id: node.id,
            position: { ...node.position, x: currentX },
          });
          currentX += (node.width ?? 0) + gap;
        });
      } else {
        const totalHeight = sortedNodes.reduce(
          (sum, n) => sum + (n.height ?? 0),
          0
        );
        const startY = firstNode.position.y;
        const endY = lastNode.position.y + (lastNode.height ?? 0);
        const gap = (endY - startY - totalHeight) / (sortedNodes.length - 1);

        let currentY = startY;
        sortedNodes.forEach((node) => {
          positions.push({
            id: node.id,
            position: { ...node.position, y: currentY },
          });
          currentY += (node.height ?? 0) + gap;
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

      toast.success(`Distributed ${selectedNodes.length} nodes ${type === 'horizontal' ? 'horizontally' : 'vertically'}`);
    },
    [getSelectedNodes, setNodes, updateNodePosition, pushHistory]
  );

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-white rounded-lg shadow-md border border-slate-200 p-1">
      <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1 mr-1">
        <button
          onClick={() => alignNodes('left')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="Align Left"
        >
          <FiAlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('center-h')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="Align Center (Horizontal)"
        >
          <FiAlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('right')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="Align Right"
        >
          <FiAlignRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('top')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors rotate-[-90deg]"
          title="Align Top"
        >
          <FiAlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('center-v')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors rotate-[-90deg]"
          title="Align Center (Vertical)"
        >
          <FiAlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => alignNodes('bottom')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors rotate-[-90deg]"
          title="Align Bottom"
        >
          <FiAlignRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1 mr-1">
        <button
          onClick={() => distributeNodes('horizontal')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="Distribute Horizontally"
        >
          <FiAlignJustify className="w-4 h-4" />
        </button>
        <button
          onClick={() => distributeNodes('vertical')}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors rotate-[-90deg]"
          title="Distribute Vertically"
        >
          <FiAlignJustify className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1 mr-1">
        <button
          onClick={onToggleSnapToGrid}
          className={`p-1.5 rounded transition-colors ${
            snapToGrid
              ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
              : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
          title={snapToGrid ? 'Disable Grid Snapping' : 'Enable Grid Snapping'}
        >
          <FiGrid className="w-4 h-4" />
        </button>
        
        <div className="relative" ref={edgeMenuRef}>
          <button
            onClick={() => setShowEdgeMenu(!showEdgeMenu)}
            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${
              edgeType !== 'default'
                ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
            title="Line style"
          >
            {edgeType === 'straight' && <FaMinus className="w-4 h-4" />}
            {edgeType === 'smoothstep' && <FaLongArrowAltRight className="w-4 h-4" />}
            {edgeType === 'bendable' && <MdShowChart className="w-4 h-4" />}
            {edgeType === 'default' && <MdShowChart className="w-4 h-4" />}
            <span className="text-xs font-medium hidden lg:inline">{currentEdgeType.label}</span>
          </button>
          
          {showEdgeMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px] z-50">
              {EDGE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  onClick={() => {
                    if (edgeType !== option.type) {
                      onToggleEdgeType();
                    }
                    setShowEdgeMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 ${
                    edgeType === option.type ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                  }`}
                >
                  <span className={`w-2 h-0.5 rounded ${
                    option.type === 'straight' ? 'bg-slate-600' :
                    option.type === 'smoothstep' ? 'bg-indigo-500' :
                    option.type === 'bendable' ? 'bg-purple-500' : 'bg-pink-500'
                  }`} style={{ transform: option.type === 'smoothstep' ? 'rotate(-30deg)' : 'none' }} />
                  <div>
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.description}</div>
                  </div>
                  {edgeType === option.type && (
                    <span className="ml-auto text-indigo-600">
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
          onClick={() => setShowMore(!showMore)}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          title="More Options"
        >
          <FiMoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CanvasToolbar;
