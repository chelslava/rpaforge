import { memo, useCallback } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { NodeResizer, useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { useBlockStore } from '../../../stores/blockStore';

type FrameNodeType = Node<ProcessNodeData>;

function FrameNodeComponent({ id, data, selected }: NodeProps<FrameNodeType>) {
  const { t } = useTranslation('common');
  const blockData = data.blockData;
  const updateNode = useBlockStore((state) => state.updateNode);
  const getNodes = useReactFlow().getNodes;
  const setNodes = useReactFlow().setNodes;

  const childCount = useCallback(() => {
    return getNodes().filter((node) => node.parentId === id).length;
  }, [getNodes, id]);

  if (!blockData || blockData.type !== 'frame') return null;
  const frameData = blockData;
  const collapsed = frameData.collapsed === true;
  const children = childCount();

  const toggleCollapsed = () => {
    const nextCollapsed = !collapsed;
    // Hide/show the framed children along with the badge state.
    const nodes = getNodes();
    setNodes(
      nodes.map((node) =>
        node.parentId === id ? { ...node, hidden: nextCollapsed } : node
      )
    );
    updateNode(id, { blockData: { ...frameData, collapsed: nextCollapsed } });
  };

  return (
    <div
      className="h-full w-full"
      data-testid={`frame-node-${id}`}
    >
      <NodeResizer
        minWidth={220}
        minHeight={140}
        isVisible={selected}
        lineClassName="!border-amber-500"
        handleClassName="!h-2 !w-2 !bg-amber-500 !border-none"
      />
      <div
        className={
          'flex h-full w-full flex-col rounded-xl border-2 px-3 pb-3 pt-2 ' +
          'bg-amber-50/40 dark:bg-amber-950/20 ' +
          '[border-color:var(--color-block-annotations-border)] ' +
          (selected
            ? 'shadow-[0_0_0_2px_var(--color-block-annotations-border)] '
            : '')
        }
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={toggleCollapsed}
            title={
              collapsed
                ? t('canvas.frameExpand')
                : t('canvas.frameCollapse')
            }
            aria-label={
              collapsed ? t('canvas.frameExpand') : t('canvas.frameCollapse')
            }
          >
            {collapsed ? (
              <FiChevronRight className="h-3.5 w-3.5" />
            ) : (
              <FiChevronDown className="h-3.5 w-3.5" />
            )}
            {frameData.title.trim() || t('blocks.frame', { ns: 'blocks' })}
            {collapsed && children > 0 && (
              <span className="rounded bg-amber-200 px-1 text-[10px] text-amber-800 dark:bg-amber-800 dark:text-amber-100">
                {children}
              </span>
            )}
          </button>
        </div>
        {!collapsed && (
          <div className="mt-1 flex-1 overflow-hidden rounded-lg border border-dashed border-amber-300/60 text-[10px] text-amber-600 dark:border-amber-700/60 dark:text-amber-400/80">
            <span className="block px-2 pt-1 opacity-70">
              {t('canvas.frameDropHint')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const FrameNode = memo(FrameNodeComponent);
export default FrameNode;
