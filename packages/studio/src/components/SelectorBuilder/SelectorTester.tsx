import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiCopy, FiLoader, FiEye } from 'react-icons/fi';
import type { SelectorTestResult } from '../../types/ipc-contracts';

interface SelectorTesterProps {
  result: SelectorTestResult | null;
  isLoading: boolean;
  selector: string;
  onHighlight?: () => void;
}

const SelectorTester: React.FC<SelectorTesterProps> = ({ result, isLoading, selector, onHighlight }) => {
  const { t } = useTranslation('common');
  const handleCopy = () => {
    if (selector) void navigator.clipboard.writeText(selector);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
        <FiLoader className="w-3.5 h-3.5 animate-spin" />
        Testing selector…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-400 dark:text-slate-500">
        Enter a selector above to test it
      </div>
    );
  }

  const statusIcon = !result.valid ? (
    <FiXCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
  ) : result.unique ? (
    <FiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
  ) : (
    <FiAlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
  );

  const statusText = !result.valid
    ? 'Not found'
    : result.unique
      ? `Unique match (1 element)`
      : `Multiple matches (${result.count} elements)`;

  const borderColor = !result.valid
    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
    : result.unique
      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20';

  return (
    <div className={`rounded border ${borderColor} px-3 py-2 text-xs`}>
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">{statusText}</span>
        <div className="flex items-center gap-1">
          {result.valid && onHighlight && (
            <button
              className="p-1 rounded text-slate-400 hover:text-indigo-500 transition-colors"
              onClick={onHighlight}
              title={t('selectorTester.highlightElement')}
              aria-label={t('selectorTester.highlightElement')}
            >
              <FiEye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            onClick={handleCopy}
            title={t('selectorTester.copySelector')}
            aria-label={t('selectorTester.copySelector')}
          >
            <FiCopy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {result.warning && (
        <p className="mt-1.5 text-yellow-600 dark:text-yellow-400 text-xs">
          {result.warning}
        </p>
      )}
    </div>
  );
};

export default SelectorTester;
