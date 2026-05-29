import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle } from 'react-icons/fi';

interface ThrowBlockEditorProps {
  blockData: {
    message?: string;
    exceptionType?: string;
  };
  onUpdateBlockData: (updates: Partial<{ message: string; exceptionType: string }>) => void;
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

const ThrowBlockEditor: React.FC<ThrowBlockEditorProps> = ({
  blockData,
  onUpdateBlockData,
}) => {
  const { t } = useTranslation('blocks');
  return (
    <div className="space-y-4">
      <div className="rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <FiAlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">{t('propertyEditors.throwBlock.title')}</span>
        </div>
        <p className="mt-1 text-xs text-red-500 dark:text-red-300">
          {t('propertyEditors.throwBlock.description')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.throwBlock.exceptionType')}
        </label>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.exceptionType || 'Exception'}
          onChange={(e) => onUpdateBlockData({ exceptionType: e.target.value })}
        >
          {EXCEPTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`exceptionTypes.${type}`)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {t(`exceptionTypes.${blockData.exceptionType || 'Exception'}_description`)}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {t('propertyEditors.throwBlock.errorMessage')}
        </label>
        <textarea
          className="w-full resize-none rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          rows={2}
          value={blockData.message || ''}
          onChange={(e) => onUpdateBlockData({ message: e.target.value })}
          placeholder={t('propertyEditors.throwBlock.errorMessagePlaceholder')}
        />
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {t('propertyEditors.throwBlock.codePreview')}
        </div>
        <pre className="mt-2 text-xs text-slate-700 dark:text-slate-300">
          raise {blockData.exceptionType || 'Exception'}("{blockData.message || 'Error occurred'}")
        </pre>
      </div>
    </div>
  );
};

export default ThrowBlockEditor;
