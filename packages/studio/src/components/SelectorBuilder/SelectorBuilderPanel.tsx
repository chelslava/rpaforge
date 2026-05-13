import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw, FiTrash2, FiLoader, FiCheck, FiCrosshair } from 'react-icons/fi';
import ElementTreeView from './ElementTreeView';
import SelectorEditor from './SelectorEditor';
import SelectorTester from './SelectorTester';
import { usePageInspection } from './hooks/usePageInspection';
import { useSelectorTest } from './hooks/useSelectorTest';
import SelectorSpyDialog from '../SelectorSpy/SelectorSpyDialog';

interface SelectorBuilderPanelProps {
  onSelect?: (selector: string) => void;
  mode?: 'web' | 'desktop';
}

const SelectorBuilderPanel: React.FC<SelectorBuilderPanelProps> = ({ onSelect, mode = 'web' }) => {
  const { t } = useTranslation('common');
  const { elements, isLoading: isInspecting, error, inspect } = usePageInspection(mode);
  const { result, isLoading: isTesting, test } = useSelectorTest(mode);
  const [selector, setSelector] = useState('');
  const [isSpyOpen, setIsSpyOpen] = useState(false);

  const handleSelectElement = useCallback((value: string) => {
    setSelector(value);
    void test(value);
  }, [test]);

  const handleSelectorChange = useCallback((value: string) => {
    setSelector(value);
  }, []);

  const handleDebouncedChange = useCallback((value: string) => {
    void test(value);
  }, [test]);

  const handleHighlight = useCallback(() => {
    const method = mode === 'desktop' ? 'highlightDesktopElement' : 'highlightElement';
    void window.rpaforge?.bridge.send(method, { selector });
  }, [selector, mode]);

  const handleClear = useCallback(() => {
    setSelector('');
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('selectorBuilder.title')}</h2>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
            onClick={() => void inspect()}
            disabled={isInspecting}
            title={t('selectorBuilder.inspectElements')}
          >
            {isInspecting ? (
              <FiLoader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FiRefreshCw className="w-3.5 h-3.5" />
            )}
            {t('selectorBuilder.inspect')}
          </button>
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
            onClick={() => setIsSpyOpen(true)}
            title={t('selectorBuilder.visualPicker')}
          >
            <FiCrosshair className="w-3.5 h-3.5" />
            {t('selectorBuilder.spy')}
          </button>
          <button
            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            onClick={handleClear}
            title={t('selectorBuilder.clearSelector')}
            aria-label={t('selectorBuilder.clearSelector')}
          >
            <FiTrash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {mode === 'desktop' ? 'Window Elements' : 'Page Elements'}
              {elements.length > 0 && (
                <span className="ml-1.5 px-1 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                  {elements.length}
                </span>
              )}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ElementTreeView elements={elements} onSelectElement={handleSelectElement} />
          </div>
        </div>

        <div className="w-1/2 flex flex-col gap-3 p-3">
          <SelectorEditor
            value={selector}
            onChange={handleSelectorChange}
            onDebouncedChange={handleDebouncedChange}
          />
          <SelectorTester
            result={result}
            isLoading={isTesting}
            selector={selector}
            onHighlight={handleHighlight}
          />
        </div>
      </div>

      {onSelect && (
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onSelect(selector)}
            disabled={!selector.trim()}
            title={t('selectorBuilder.insertSelector')}
          >
            <FiCheck className="w-4 h-4" />
            {t('selectorBuilder.use')}
          </button>
        </div>
      )}

      <SelectorSpyDialog
        isOpen={isSpyOpen}
        mode={mode}
        onClose={() => setIsSpyOpen(false)}
        onSelect={(sel) => {
          setSelector(sel);
          void test(sel);
        }}
      />
    </div>
  );
};

export default SelectorBuilderPanel;
