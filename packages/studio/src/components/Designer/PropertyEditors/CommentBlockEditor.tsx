import React from 'react';
import { useTranslation } from 'react-i18next';

import type { BlockData } from '../../../types/blocks';

type CommentBlock = Extract<BlockData, { type: 'comment' }>;

interface CommentBlockEditorProps {
  blockData: BlockData;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

const CommentBlockEditor: React.FC<CommentBlockEditorProps> = ({
  blockData,
  onUpdateBlockData,
}) => {
  const { t } = useTranslation('common');
  const comment = blockData as CommentBlock;

  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
        {t('propertyEditors.comment.text')}
      </label>
      <textarea
        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
        rows={6}
        value={comment.text}
        placeholder={t('canvas.commentPlaceholder')}
        onChange={(event) => onUpdateBlockData({ text: event.target.value })}
      />
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t('propertyEditors.comment.help')}
      </div>
    </div>
  );
};

export default CommentBlockEditor;
