import { useTranslation } from 'react-i18next';
import type { BlockData } from '../../../types/blocks';

type EndBlock = Extract<BlockData, { type: 'end' }>;

interface EndBlockEditorProps {
  blockData: EndBlock;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

export function EndBlockEditor({
  blockData,
  onUpdateBlockData,
}: EndBlockEditorProps) {
  const { t } = useTranslation('blocks');

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('endBlock.status')}
        </label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.status}
          onChange={(event) => onUpdateBlockData({ status: event.target.value })}
        >
          <option value="PASS">{t('endBlock.pass')}</option>
          <option value="FAIL">{t('endBlock.fail')}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('endBlock.message')}
        </label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.message || ''}
          onChange={(event) => onUpdateBlockData({ message: event.target.value })}
        />
      </div>
    </>
  );
}

export default EndBlockEditor;
