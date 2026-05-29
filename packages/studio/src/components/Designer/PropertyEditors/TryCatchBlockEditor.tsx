import { useTranslation } from 'react-i18next';
import { FiPlus, FiX } from 'react-icons/fi';

import type { BlockData } from '../../../types/blocks';

type TryCatchBlock = Extract<BlockData, { type: 'try-catch' }>;

interface TryCatchBlockEditorProps {
  blockData: TryCatchBlock;
  onUpdateExceptBlock: (
    index: number,
    updates: { exceptionType?: string; variable?: string }
  ) => void;
  onAddExceptBlock: () => void;
  onRemoveExceptBlock: (index: number) => void;
  onToggleFinallyBlock: (enabled: boolean) => void;
}

const EXCEPTION_TYPES = [
  'Exception',
  'ValueError',
  'TypeError',
  'RuntimeError',
  'KeyError',
  'IndexError',
  'AttributeError',
  'ImportError',
  'OSError',
  'TimeoutError',
  'FileNotFoundError',
  'PermissionError',
  'ConnectionError',
];

export function TryCatchBlockEditor({
  blockData,
  onUpdateExceptBlock,
  onAddExceptBlock,
  onRemoveExceptBlock,
  onToggleFinallyBlock,
}: TryCatchBlockEditorProps) {
  const { t } = useTranslation('blocks');

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('tryCatch_handlers')}
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onAddExceptBlock}
          >
            <FiPlus className="h-3.5 w-3.5" />
            {t('propertyEditors.tryCatch.addHandler')}
          </button>
        </div>
        <div className="space-y-2">
          {blockData.exceptBlocks.length > 0 ? (
            blockData.exceptBlocks.map((exceptBlock, index) => (
              <div
                key={exceptBlock.id}
                className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('tryCatch_handlerLabel', { index: index })}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                    onClick={() => onRemoveExceptBlock(index)}
                    title={t('propertyEditors.tryCatch.removeHandler')}
                  >
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      {t('tryCatch_exceptionType')}
                    </label>
                    <select
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={exceptBlock.exceptionType || 'Exception'}
                      onChange={(event) =>
                        onUpdateExceptBlock(index, {
                          exceptionType: event.target.value,
                        })
                      }
                    >
                      {EXCEPTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`exceptionTypes.${type}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      {t('tryCatch_variable')}
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={exceptBlock.variable || ''}
                      onChange={(event) =>
                        onUpdateExceptBlock(index, { variable: event.target.value })
                      }
                      placeholder={t('propertyEditors.tryCatch.exceptionVariablePlaceholder')}
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              {t('propertyEditors.tryCatch.noHandlers')}
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(blockData.finallyBlock)}
          onChange={(event) => onToggleFinallyBlock(event.target.checked)}
          className="rounded border-slate-300 dark:border-slate-600"
        />
        <span className="font-medium text-slate-600 dark:text-slate-300">
          {t('enable_finally')}
        </span>
      </label>

      <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
        {t('tryCatch_finallyDescription')}
      </div>
    </div>
  );
}

export default TryCatchBlockEditor;
