import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiX,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiAlertCircle,
  FiCircle,
  FiEdit2,
} from 'react-icons/fi';
import EmptyState from '../Common/EmptyState';
import ExpressionEditor, { type ValidationResult } from '../Designer/ExpressionEditor';
import type { VariableInfo } from '../Designer/VariablePicker';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useEngine } from '../../hooks/useEngine';
import type { Breakpoint } from '../../types/engine';

const BreakpointPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    breakpoints,
    toggleBreakpoint,
    removeBreakpoint,
    clearBreakpoints,
  } = useDebuggerStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  const breakpointsList = Array.from(breakpoints.values());

  const handleToggle = useCallback(
    (id: string) => { toggleBreakpoint(id); },
    [toggleBreakpoint]
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (editingId === id) setEditingId(null);
      removeBreakpoint(id);
    },
    [removeBreakpoint, editingId]
  );

  const handleEdit = useCallback(
    (id: string) => { setEditingId((prev) => (prev === id ? null : id)); },
    []
  );

  const handleCloseEditor = useCallback(() => { setEditingId(null); }, []);

  const handleClearAll = useCallback(() => {
    setEditingId(null);
    clearBreakpoints();
  }, [clearBreakpoints]);

  const enabled = breakpointsList.filter((b) => b.enabled);
  const disabled = breakpointsList.filter((b) => !b.enabled);

  if (breakpointsList.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-sm text-slate-700 dark:text-slate-200">{t('breakpoints.title')}</h2>
        </div>
        <div className="flex-1">
          <EmptyState
            icon={<FiCircle className="w-8 h-8 text-slate-400 dark:text-slate-500" />}
            title={t('emptyState.noBreakpoints')}
            description={t('emptyState.addBreakpoint')}
          />
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
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">
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
                  editing={editingId === bp.id}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onEdit={handleEdit}
                  onCloseEditor={handleCloseEditor}
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
                  editing={editingId === bp.id}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onEdit={handleEdit}
                  onCloseEditor={handleCloseEditor}
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
  editing: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  onCloseEditor: () => void;
}

const BreakpointRow: React.FC<BreakpointRowProps> = ({
  breakpoint,
  editing,
  onToggle,
  onRemove,
  onEdit,
  onCloseEditor,
}) => {
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
            : 'bg-transparent border-slate-400 dark:border-slate-500'
          }`}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
            {fileName}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('breakpoints.title')} {breakpoint.line}
            </span>
            {breakpoint.condition && (
              <span className="inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-mono">
                <FiAlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {breakpoint.condition}
              </span>
            )}
            {breakpoint.hitCondition && (
              <span className="inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-mono">
                {t('breakpoints.hitCountChip', { count: breakpoint.hitCondition })}
              </span>
            )}
          </div>
        </div>

        <button
          className="p-1 rounded text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); onEdit(breakpoint.id); }}
          title={t('breakpoints.editBreakpoint')}
          aria-label={t('breakpoints.editBreakpoint')}
          aria-expanded={editing}
        >
          <FiEdit2 className="w-4 h-4" />
        </button>

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
          className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(breakpoint.id); }}
          title={t('breakpoints.removeBreakpoint')}
          aria-label={`${t('breakpoints.removeBreakpoint')} ${t('breakpoints.title')} ${breakpoint.line}`}
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>

      {editing && (
        <BreakpointEditor breakpoint={breakpoint} onClose={onCloseEditor} />
      )}
    </div>
  );
};

interface BreakpointEditorProps {
  breakpoint: Breakpoint;
  onClose: () => void;
}

/**
 * Inline condition / hit-count editor for one breakpoint (issue #867).
 *
 * The condition is validated statically by ExpressionEditor while typing and
 * against the engine snapshot on save — engine failures come back as data
 * ({ok: false, error}) and render inline instead of throwing (#836 pattern).
 */
const BreakpointEditor: React.FC<BreakpointEditorProps> = ({ breakpoint, onClose }) => {
  const { t } = useTranslation('common');
  const setBreakpointCondition = useDebuggerStore((s) => s.setBreakpointCondition);
  const setBreakpointHitCount = useDebuggerStore((s) => s.setBreakpointHitCount);
  const snapshotVariables = useDebuggerStore((s) => s.variables);
  const { evaluateExpression } = useEngine();

  const [condition, setCondition] = useState(breakpoint.condition ?? '');
  const [hitCount, setHitCount] = useState(breakpoint.hitCondition ?? '');
  const [hitError, setHitError] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [staticErrors, setStaticErrors] = useState<string[]>([]);

  const variables = useMemo<VariableInfo[]>(
    () =>
      snapshotVariables.map((v) => ({
        name: v.name,
        type: v.type,
        scope: 'task',
        value: v.value == null ? undefined : String(v.value),
      })),
    [snapshotVariables]
  );

  const nodeId = breakpoint.nodeId || breakpoint.file;

  // Stable identity + same-reference updates keep ExpressionEditor's
  // onValidationChange effect from looping (watch-panel lesson, issue #836).
  const handleValidationChange = useCallback((result: ValidationResult) => {
    setStaticErrors((prev) =>
      prev.length === result.errors.length &&
      prev.every((err, i) => err === result.errors[i])
        ? prev
        : result.errors
    );
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = condition.trim();
    const hitText = hitCount.trim();
    let count: number | null = null;

    if (hitText !== '') {
      const parsed = Number(hitText);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setHitError(true);
        return;
      }
      count = parsed;
    }

    setHitError(false);
    setEngineError(null);
    setBreakpointCondition(nodeId, trimmed || null);
    setBreakpointHitCount(nodeId, count);

    if (trimmed) {
      try {
        const result = await evaluateExpression(trimmed);
        if (result && result.ok === false && result.error && result.error !== 'engine not running') {
          setEngineError(result.error);
          return;
        }
      } catch {
        // Engine offline — the condition stays validated statically only.
      }
    }

    onClose();
  }, [condition, hitCount, nodeId, evaluateExpression, setBreakpointCondition, setBreakpointHitCount, onClose]);

  return (
    <div
      className="mx-2 mb-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-2 space-y-2"
      data-testid={`breakpoint-editor-${breakpoint.id}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void handleSave();
        }
      }}
    >
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        {t('breakpoints.conditionLabel')}
      </label>
      <ExpressionEditor
        value={condition}
        onChange={(value) => { setCondition(value); setEngineError(null); }}
        variables={variables}
        placeholder={t('breakpoints.conditionPlaceholder')}
        rows={2}
        showEditorButton={false}
        onValidationChange={handleValidationChange}
      />
      <label
        className="block text-xs font-medium text-slate-600 dark:text-slate-300"
        htmlFor={`breakpoint-hit-count-${breakpoint.id}`}
      >
        {t('breakpoints.hitCountLabel')}
      </label>
      <input
        id={`breakpoint-hit-count-${breakpoint.id}`}
        type="number"
        min={1}
        step={1}
        value={hitCount}
        onChange={(e) => {
          setHitCount(e.target.value);
          setHitError(false);
        }}
        className={`w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-700 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
          hitError
            ? 'border-red-400 dark:border-red-500'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {t('breakpoints.hitCountHint')}
      </p>
      {hitError && (
        <p className="text-[11px] text-red-500 dark:text-red-400" role="alert">
          {t('breakpoints.hitCountInvalid')}
        </p>
      )}
      {!hitError && staticErrors.length > 0 && condition.trim() !== '' && (
        <p className="text-[11px] text-red-500 dark:text-red-400" role="alert">
          {staticErrors[0]}
        </p>
      )}
      {engineError && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400" role="alert">
          {t('breakpoints.engineConditionError', { error: engineError })}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-2.5 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
          onClick={() => { void handleSave(); }}
        >
          {t('breakpoints.saveBreakpoint')}
        </button>
        <button
          type="button"
          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          onClick={onClose}
        >
          {t('breakpoints.cancelEditBreakpoint')}
        </button>
      </div>
    </div>
  );
};

export default BreakpointPanel;
