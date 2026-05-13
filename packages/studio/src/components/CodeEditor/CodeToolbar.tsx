import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiSearch,
  FiRefreshCw,
  FiCode,
  FiGrid,
  FiChevronDown,
  FiDatabase,
} from 'react-icons/fi';

interface CodeToolbarProps {
  onFind?: () => void;
  onReplace?: () => void;
  onFormat?: () => void;
  onOpenSnippets?: () => void;
  onOpenVariables?: () => void;
  isSnippetPanelOpen?: boolean;
  isVariablesPanelOpen?: boolean;
  variableCount?: number;
}

const CodeToolbar: React.FC<CodeToolbarProps> = ({
  onFind,
  onReplace,
  onFormat,
  onOpenSnippets,
  onOpenVariables,
  isSnippetPanelOpen = false,
  isVariablesPanelOpen = false,
   variableCount = 0,
 }) => {
   const { t } = useTranslation('common');
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex items-center gap-1">
        <button
          onClick={onFind}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title={t('codeEditor.toolbar.find')}
        >
          <FiSearch className="w-4 h-4" />
          <span>{t('find')}</span>
        </button>

        <button
          onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title={t('codeEditor.toolbar.replace')}
        >
          <FiRefreshCw className="w-4 h-4" />
          <span>{t('replace')}</span>
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        <button
          onClick={onFormat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          title={t('codeEditor.toolbar.formatCode')}
        >
          <FiCode className="w-4 h-4" />
          <span>{t('format')}</span>
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        <button
          onClick={onOpenSnippets}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
            isSnippetPanelOpen
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title={t('codeEditor.toolbar.snippets')}
        >
          <FiGrid className="w-4 h-4" />
          <span>{t('snippets')}</span>
          <FiChevronDown className="w-3 h-3" />
        </button>

        <button
          onClick={onOpenVariables}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
            isVariablesPanelOpen
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title={t('codeEditor.toolbar.variables')}
        >
          <FiDatabase className="w-4 h-4" />
          <span>{t('variables')}</span>
          {variableCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-indigo-200 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-200 rounded-full">
              {variableCount}
            </span>
          )}
          <FiChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default CodeToolbar;
