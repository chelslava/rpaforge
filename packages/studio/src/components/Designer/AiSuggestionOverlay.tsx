/**
 * AI Suggestion Overlay component for RPAForge Studio (Issue #592).
 * Renders floating suggestion chips near the selected node in the canvas.
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { SuggestionItem } from '../../types/ai';
import { createLogger } from '../../utils/logger';
import { useBlockStore } from '../../stores/blockStore';
import type { ProcessNodeData } from '../../stores/blockStore';
import { createActivityBlockData } from '../../types/blocks';

const logger = createLogger('AiSuggestionOverlay');

interface AiSuggestionOverlayProps {
  selectedNodeId: string | null;
  suggestions: SuggestionItem[];
  isThinking: boolean;
  onClearSuggestions: () => void;
}

interface OverlayPosition {
  top: number;
  left: number;
}

const AiSuggestionOverlay: React.FC<AiSuggestionOverlayProps> = ({
  selectedNodeId,
  suggestions,
  isThinking,
  onClearSuggestions,
}) => {
  const { t } = useTranslation('common');
  const suggestionRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

  const nodes = useBlockStore((state) => state.nodes);

  // Find selected node position
  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  // Calculate overlay position
  useEffect(() => {
    if (!selectedNode || !reactFlowWrapperRef.current) {
      setPosition(null);
      return;
    }

    try {
      const wrapper = reactFlowWrapperRef.current;
      const nodeElement = wrapper.querySelector(`[data-node-id="${selectedNode.id}"]`);

      if (nodeElement) {
        const rect = nodeElement.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        // Position below the node with some offset
        const newNodePosition: OverlayPosition = {
          top: rect.bottom - wrapperRect.top + 8,
          left: Math.min(
            Math.max(rect.left - wrapperRect.left, 16),
            wrapperRect.width - 300
          ),
        };

        setPosition(newNodePosition);
      } else {
        // Node not yet rendered, use node position
        setPosition({
          top: selectedNode.position.y - reactFlowWrapperRef.current!.getBoundingClientRect().top + 80,
          left: selectedNode.position.x - reactFlowWrapperRef.current!.getBoundingClientRect().left,
        });
      }
    } catch (err) {
      logger.error('Failed to calculate overlay position', err);
      setPosition(null);
    }
  }, [selectedNode]);

  // Handle suggestion click
  const handleSuggestionClick = async (suggestion: SuggestionItem) => {
    // Find the activity details
    const activities = await window.rpaforge?.engine.getActivities();
    if (!activities || !activities.activities) {
      logger.warn('Failed to get activities for suggestion');
      return;
    }

    // Get activity from the list
    const activity = activities.activities.find(a => a.id === suggestion.activityId);
    if (!activity) {
      logger.warn(`Activity not found: ${suggestion.activityId}`);
      return;
    }

    // Add the new node
    if (selectedNode && selectedNodeId) {
      const wrapper = reactFlowWrapperRef.current;
      if (wrapper) {
        // Position new node to the right of selected node
        const newNodePosition = {
          x: selectedNode.position.x + 200,
          y: selectedNode.position.y + 40,
        };

        // Get the addNode function
        const { addNode, addEdge } = useBlockStore.getState();

        // Create the new node - use default values for activity params
        const activityParams: Record<string, string> = {};
        if (activity.params) {
          for (const param of activity.params) {
            if (param.default !== undefined && param.default !== null) {
              activityParams[param.name] = String(param.default);
            } else if (param.type === 'boolean') {
              activityParams[param.name] = 'false';
            } else if (param.type === 'integer' || param.type === 'float') {
              activityParams[param.name] = '0';
            } else {
              activityParams[param.name] = '';
            }
          }
        }

        // Create the activity block data using the helper
        const blockData = createActivityBlockData(activity, suggestion.activityId);
        
        const newNode = {
          id: crypto.randomUUID(),
          type: 'activity' as const,
          position: newNodePosition,
          data: {
            activity,
            blockData,
            activityValues: blockData.params,
            builtinSettings: {
              timeout: activity.timeout_ms && activity.timeout_ms > 0 ? activity.timeout_ms / 1000 : undefined,
              retryEnabled: activity.has_retry ? false : undefined,
              retryCount: activity.has_retry ? 3 : undefined,
              retryInterval: activity.has_retry ? '2s' : undefined,
              continueOnError: activity.has_continue_on_error ? false : undefined,
            },
            description: activity.description,
            tags: [],
          } satisfies ProcessNodeData,
        };

        addNode(newNode);
        addEdge({
          id: `edge-${selectedNodeId}-${newNode.id}`,
          source: selectedNodeId,
          target: newNode.id,
          type: 'default' as const,
          markerEnd: { type: 'arrowclosed' },
        });

        // Clear suggestions and select new node
        onClearSuggestions();
      }
    }
  };

  // Don't render if no node selected or no position
  if (!selectedNode || !position || suggestions.length === 0) {
    return null;
  }

  return (
    <>
      {/* Hidden React Flow wrapper ref */}
      <div ref={reactFlowWrapperRef} className="hidden" />

      {/* Overlay - rendered in portal */}
      {createPortal(
        <div
          ref={suggestionRef}
          className="fixed z-50 flex flex-col gap-3 p-3 bg-ui-surface/95 backdrop-blur-md border border-ui-primary rounded-xl shadow-2xl transition-all duration-300 animate-fadeIn"
          style={{
            top: position.top,
            left: position.left,
          }}
          data-testid="ai-suggestion-overlay"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 border-b border-ui-outline pb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-ui-primary/20">
              <svg
                className="w-4 h-4 text-ui-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold text-ui-text">
              {isThinking
                ? t('ai.suggestions.thinking')
                : t('ai.suggestions.title')}
            </span>
          </div>

          {/* Suggestions */}
          <div className="flex flex-col gap-2 min-w-[280px]">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.activityId}
                onClick={() => handleSuggestionClick(suggestion)}
                className="group flex items-start gap-3 p-3 bg-ui-surface hover:bg-ui-primary/5 rounded-lg border border-ui-outline hover:border-ui-primary/30 transition-all duration-200 text-left"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Activity icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-ui-surface-2 border border-ui-outline">
                  <svg
                    className="w-5 h-5 text-ui-text-subtle"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-ui-text truncate" title={suggestion.label}>
                      {suggestion.label}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase bg-ui-primary/10 text-ui-primary rounded">
                      AI
                    </span>
                  </div>
                  <p className="text-xs text-ui-text-subtle line-clamp-2" title={suggestion.reason}>
                    {suggestion.reason}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Styles for animation */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default AiSuggestionOverlay;
