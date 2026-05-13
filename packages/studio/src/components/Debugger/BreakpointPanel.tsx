import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiX,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiAlertCircle,
} from 'react-icons/fi';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { Breakpoint } from '../../types/engine';

const BreakpointPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    breakpoints,
    toggleBreakpoint,
    removeBreakpoint,
    clearBreakpoints,
  } = useDebuggerStore();

  const breakpointsList = Array.from(breakpoints.values());

  const handleToggle = useCallback(
    (id: string) => { toggleBreakpoint(id); },
    [toggleBreakpoint]
  );

  const handleRemove = useCallback(
    (id: string) => { removeBreakpoint(id); },
    [removeBreakpoint]
  );

  const handleClearAll = useCallback(() => { clearBreakpoints(); }, [clearBreakpoints]);

  const enabled = breakpointsList.filter((b) => b.enabled);
  const disabled = breakpointsList.filter((b) => !b.enabled);

  if (breakpointsList.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-sm text-slate-700 dark:text-slate-200">{t('breakpoints.title')}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-sm text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-slate-600 mx-auto mb-2" />
            <p>{t('breakpoints.noBreakpoints')}</p>
            <p className="text-xs mt-1">{t('breakpoints.clickToAddBreakpoint')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm text-slate-700 dark:text-slate-200">{t('breakpoints.title')}</h2>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">
            {enabled.length} {t('breakpoints.active')}
          </span>
          {disabled.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 font-medium">
              {disabled.length} {t('breakpoints.off')}
            </span>
          )}
        </div>
        <button
          className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          onClick={handleClearAll}
          title={t('breakpoints.clearAllBreakpoints')}
          aria-label={t('breakpoints.clearAllBreakpoints')}
        >
          <FiTrash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {enabled.length > 0 && (
          <section>
            <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {t('breakpoints.active')}
            </div>
            <div className="px-2 space-y-1">
              {enabled.map((bp) => (
                <BreakpointRow
                  key={bp.id}
                  breakpoint={bp}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </section>
        )}

        {disabled.length > 0 && (
          <section>
            <div className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {t('breakpoints.disabled')}
            </div>
            <div className="px-2 space-y-1">
              {disabled.map((bp) => (
                <BreakpointRow
                  key={bp.id}
                  breakpoint={bp}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

interface BreakpointRowProps {
  breakpoint: Breakpoint;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

const BreakpointRow: React.FC<BreakpointRowProps> = ({ breakpoint, onToggle, onRemove }) => {
  const { t } = useTranslation('common');
  const fileName = breakpoint.file
    ? breakpoint.file.split(/[\\/]/).pop() ?? breakpoint.file
    : 'Unknown';

  return (
    <div
      className={`rounded-md text-sm transition-all ${
        breakpoint.enabled
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 opacity-60'
      }`}
      role="listitem"
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 border-2 ${
            breakpoint.enabled
              ? 'bg-red-500 border-red-600'
              : 'bg-transparent border-slate-400'
          }`}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
            {fileName}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('breakpoints.title')} {breakpoint.line}
            </span>
            {breakpoint.condition && (
              <span className="inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-mono">
                <FiAlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {breakpoint.condition}
              </span>
            )}
          </div>
        </div>

        <button
          className="p-1 rounded text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggle(breakpoint.id); }}
          title={breakpoint.enabled ? t('breakpoints.disableBreakpoint') : t('breakpoints.enableBreakpoint')}
          aria-label={breakpoint.enabled ? t('breakpoints.disableBreakpoint') : t('breakpoints.enableBreakpoint')}
          aria-pressed={breakpoint.enabled}
        >
          {breakpoint.enabled ? (
            <FiToggleRight className="w-4 h-4 text-indigo-500" />
          ) : (
            <FiToggleLeft className="w-4 h-4" />
          )}
        </button>

        <button
          className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(breakpoint.id); }}
          title={t('breakpoints.removeBreakpoint')}
          aria-label={`${t('breakpoints.removeBreakpoint')} ${t('breakpoints.title')} ${breakpoint.line}`}
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default BreakpointPanel;
