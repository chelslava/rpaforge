import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { NodeResizer } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { useBlockStore } from '../../../stores/blockStore';

type CommentNodeType = Node<ProcessNodeData>;

function CommentBlockComponent({ id, data, selected }: NodeProps<CommentNodeType>) {
  const { t } = useTranslation('common');
  const blockData = data.blockData;
  const updateNode = useBlockStore((state) => state.updateNode);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const startEditing = useCallback(() => {
    setDraft(blockData?.type === 'comment' ? blockData.text : '');
    setEditing(true);
  }, [blockData]);

  const commitEditing = useCallback(() => {
    setEditing(false);
    if (blockData?.type === 'comment' && blockData.text !== draft) {
      updateNode(id, { blockData: { ...blockData, text: draft } });
    }
  }, [blockData, draft, id, updateNode]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
  }, []);

  if (!blockData || blockData.type !== 'comment') return null;
  const commentData = blockData;

  return (
    <div
      className="w-full h-full"
      data-testid={`comment-node-${id}`}
      onDoubleClick={startEditing}
    >
      <NodeResizer
        minWidth={140}
        minHeight={60}
        isVisible={selected}
        lineClassName="!border-amber-400"
        handleClassName="!h-2 !w-2 !bg-amber-400 !border-none"
      />
      <div
        className={
          'flex h-full w-full flex-col rounded-lg border-2 border-dashed px-3 py-2 text-left ' +
          'bg-amber-50/90 dark:bg-amber-950/60 ' +
          '[border-color:var(--color-block-annotations-border)] ' +
          (selected
            ? 'shadow-[0_0_0_2px_var(--color-block-annotations-border)] '
            : '')
        }
        style={{
          color: 'var(--color-block-annotations)',
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="w-full flex-1 resize-none bg-transparent text-xs text-slate-800 dark:text-slate-200 outline-none"
            value={draft}
            placeholder={t('canvas.commentPlaceholder')}
            aria-label={t('canvas.commentLabel')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                commitEditing();
              } else if (event.key === 'Escape') {
                cancelEditing();
              }
            }}
          />
        ) : (
          <div
            className="flex-1 overflow-hidden whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-300"
            title={t('canvas.commentEditHint')}
          >
            {commentData.text.trim() ? (
              commentData.text
            ) : (
              <span className="italic opacity-60">
                {t('canvas.commentEmpty')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const CommentBlock = memo(CommentBlockComponent);
export default CommentBlock;
