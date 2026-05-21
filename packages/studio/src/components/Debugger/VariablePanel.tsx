import React, { useState, useMemo } from 'react';
import { FiX, FiEye, FiEyeOff, FiPlus, FiTrash2, FiInfo } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../Common/ConfirmDialog';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useVariableStore } from '../../stores/variableStore';
import { useDiagramStore } from '../../stores/diagramStore';
import type { Variable } from '../../types/engine';
import VariableDialog, { type VariableDefinition } from '../Designer/VariableDialog';

interface DataFrameValue {
  __type: 'dataframe';
  frame_name: string;
  shape: { rows: number; cols: number };
  columns: string[];
  preview: Array<Record<string, unknown>>;
}

const DataFrameTableView: React.FC<{ value: DataFrameValue }> = ({ value }) => {
  const { shape, columns, preview } = value;
  return (
    <div className="ml-8 mr-2 mt-1 mb-2 overflow-x-auto">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        {shape.rows} строк × {columns.length} столбцов
        {shape.rows > preview.length && ` (показаны первые ${preview.length})`}
      </div>
      <div className="border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-teal-50 dark:bg-teal-900/30">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-left font-medium text-teal-700 dark:text-teal-300 border-r border-slate-200 dark:border-slate-700 last:border-r-0 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr
                key={i}
                className={
                  i % 2 === 0
                    ? 'bg-white dark:bg-slate-900'
                    : 'bg-slate-50 dark:bg-slate-800/50'
                }
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-2 py-1 border-r border-slate-200 dark:border-slate-700 last:border-r-0 text-slate-700 dark:text-slate-300 font-mono max-w-[120px] truncate"
                  >
                    {row[col] === null || row[col] === undefined ? (
                      <span className="text-slate-400 italic">null</span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const VariableItem: React.FC<{
  variable: Variable;
  depth?: number;
  watched?: boolean;
  onToggleWatch?: () => void;
}> = ({ variable, depth = 0, watched = false, onToggleWatch }) => {
  const { t } = useTranslation('common');
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const isDataFrame =
    variable.type === 'dataframe' &&
    typeof variable.value === 'object' &&
    variable.value !== null &&
    (variable.value as Record<string, unknown>).__type === 'dataframe';
  const hasChildren = !isDataFrame && !!(variable.children && variable.children.length > 0);
  const isExpandable = isDataFrame || hasChildren;

  const valueDisplay = useMemo(() => {
    if (variable.value === null) return 'null';
    if (variable.value === undefined) return 'undefined';
    if (isDataFrame) {
      const df = variable.value as DataFrameValue;
      return `DataFrame(${df.shape.rows}r × ${df.shape.cols}c)`;
    }
    if (typeof variable.value === 'string') {
      const truncated = variable.value.length > 30
        ? variable.value.slice(0, 30) + '...'
        : variable.value;
      return `"${truncated}"`;
    }
    if (Array.isArray(variable.value)) {
      return `Array(${variable.value.length})`;
    }
    if (typeof variable.value === 'object') {
      const keys = Object.keys(variable.value);
      const preview = keys.slice(0, 3).join(', ');
      const suffix = keys.length > 3 ? ', ...' : '';
      return `{${preview}${suffix}}`;
    }
    return String(variable.value);
  }, [variable.value, variable.type, isDataFrame]);

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string':
        return 'text-green-500';
      case 'number':
      case 'integer':
      case 'float':
        return 'text-blue-500';
      case 'boolean':
        return 'text-orange-500';
      case 'list':
      case 'dict':
      case 'object':
        return 'text-purple-500';
      case 'dataframe':
        return 'text-teal-500';
      case 'none':
      case 'null':
        return 'text-slate-400';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="variable-item">
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {isExpandable ? (
          <span className={`w-4 text-slate-400 text-xs ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-indigo-600 dark:text-indigo-400 text-sm">
          {variable.name}
        </span>
        <span className={`text-xs ${getTypeColor(variable.type)}`}>{valueDisplay}</span>
        <span className="ml-auto text-xs text-slate-400">{variable.type}</span>
        {onToggleWatch && (
          <button
            className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
              watched ? 'text-indigo-500' : 'text-slate-400'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch();
            }}
            title={watched ? t('debuggerPanel.removeFromWatch') : t('debuggerPanel.addToWatch')}
          >
            {watched ? <FiEye className="w-3 h-3" /> : <FiEyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
      {isExpanded && isDataFrame && (
        <DataFrameTableView value={variable.value as DataFrameValue} />
      )}
      {isExpanded && hasChildren && (
        <div className="variable-children">
          {variable.children!.map((child: Variable, index: number) => (
            <VariableItem
              key={`${child.name}-${index}`}
              variable={child}
              depth={depth + 1}
              watched={watched}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const VariablePanel: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    variables,
    watchedVariables,
    addWatchedVariable,
    removeWatchedVariable,
    clearWatchedVariables,
  } = useDebuggerStore();

  const { 
    variables: allVariables, 
    addVariable, 
    removeVariable 
  } = useVariableStore();
  
  const projectId = useDiagramStore((state) => state.project?.id || '');

  const processVariables = useMemo(() => {
    if (!projectId) return allVariables;
    return allVariables.filter((v) => v.projectId === projectId);
  }, [allVariables, projectId]);
  
  const [activeTab, setActiveTab] = useState<'variables' | 'watch' | 'process'>('variables');
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const watchedVars = useMemo(() => {
    return variables.filter((v) => watchedVariables.has(v.name));
  }, [variables, watchedVariables]);

  const filteredVariables = useMemo(() => {
    if (!searchQuery) return variables;
    const q = searchQuery.toLowerCase();
    return variables.filter(
      (v) => v.name.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)
    );
  }, [variables, searchQuery]);

  const filteredProcessVariables = useMemo(() => {
    if (!searchQuery) return processVariables;
    const q = searchQuery.toLowerCase();
    return processVariables.filter(
      (v) => v.name.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)
    );
  }, [processVariables, searchQuery]);

  const filteredWatchedVars = useMemo(() => {
    if (!searchQuery) return watchedVars;
    const q = searchQuery.toLowerCase();
    return watchedVars.filter(
      (v) => v.name.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)
    );
  }, [watchedVars, searchQuery]);

  const variableOptions = useMemo(
    () =>
      processVariables.map((variable) => ({
        name: variable.name,
        type: variable.type,
        scope: variable.scope,
        value: variable.value,
      })),
    [processVariables]
  );

  const handleToggleWatch = (name: string) => {
    if (watchedVariables.has(name)) {
      removeWatchedVariable(name);
    } else {
      addWatchedVariable(name);
    }
  };

  const handleCreateVariable = (definition: VariableDefinition) => {
    addVariable(definition, '', undefined);
  };

  const getScopeBadge = (scope: string) => {
    const colors: Record<string, string> = {
      process: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
      task: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    };
    return (
      <span className={`px-1.5 py-0.5 text-xs rounded ${colors[scope] || colors.task}`}>
        {scope}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {showGuide && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-indigo-700 dark:text-indigo-300">
              <div className="flex items-center gap-1 font-medium mb-1">
                <FiInfo className="w-3 h-3" />
                {t('debuggerPanel.variablePanelGuide')}
              </div>
              <ul className="space-y-0.5 text-[11px] opacity-80">
                <li><strong>{t('debuggerPanel.runtime')}:</strong> {t('debuggerPanel.noRuntimeVariables').split(' ').slice(-3).join(' ')}</li>
                <li><strong>{t('debuggerPanel.process')}:</strong> {t('debuggerPanel.noProcessVariables').split(' ').slice(-3).join(' ')}</li>
                <li><strong>{t('debuggerPanel.watch')}:</strong> {t('debuggerPanel.noWatchedVariables').split(' ').slice(-3).join(' ')}</li>
              </ul>
            </div>
            <button
              className="text-indigo-400 hover:text-indigo-600"
              onClick={() => setShowGuide(false)}
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-1">
          <button
            className={`px-2 py-1 text-sm rounded ${
              activeTab === 'variables'
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('variables')}
          >
            {t('debuggerPanel.runtime')}
          </button>
          <button
            className={`px-2 py-1 text-sm rounded ${
              activeTab === 'process'
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('process')}
          >
            {t('debuggerPanel.process')} ({processVariables.length})
          </button>
          <button
            className={`px-2 py-1 text-sm rounded ${
              activeTab === 'watch'
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('watch')}
          >
            {t('debuggerPanel.watch')} {watchedVariables.size > 0 && `(${watchedVariables.size})`}
          </button>
        </div>
        {!showGuide && (
          <button
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={() => setShowGuide(true)}
            title={t('debuggerPanel.showGuide')}
          >
            <FiInfo className="w-4 h-4" />
          </button>
        )}
        <div className="flex gap-1">
          {(activeTab === 'process' || activeTab === 'variables') && (
            <button
              className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900 rounded"
              onClick={() => setShowVariableDialog(true)}
              title={t('debuggerPanel.createVariable')}
              aria-label={t('debuggerPanel.createVariable')}
            >
              <FiPlus className="w-4 h-4" />
            </button>
          )}
          {activeTab === 'watch' && watchedVariables.size > 0 && (
            <button
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
              onClick={clearWatchedVariables}
              title={t('debuggerPanel.clearAllWatches')}
              aria-label={t('debuggerPanel.clearAllWatches')}
            >
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <input
          type="text"
          placeholder={t('debuggerPanel.filterVariables')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'variables' ? (
          variables.length === 0 ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
              {t('debuggerPanel.noRuntimeVariables')}
              <div className="text-xs mt-1">{t('debuggerPanel.variablesDuringDebugging')}</div>
              <button
                onClick={() => setShowVariableDialog(true)}
                className="mt-3 px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs flex items-center gap-1 mx-auto"
              >
                <FiPlus className="w-3 h-3" />
                {t('debuggerPanel.createProcessVariable')}
              </button>
            </div>
          ) : filteredVariables.length === 0 ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
              {t('debuggerPanel.variablesMatchQuery', { query: searchQuery })}
            </div>
          ) : (
            <div className="py-2">
              {filteredVariables.map((variable, index) => (
                <VariableItem
                  key={`${variable.name}-${index}`}
                  variable={variable}
                  watched={watchedVariables.has(variable.name)}
                  onToggleWatch={() => handleToggleWatch(variable.name)}
                />
              ))}
            </div>
          )
        ) : activeTab === 'process' ? (
          processVariables.length === 0 ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
              {t('debuggerPanel.noProcessVariables')}
              <div className="text-xs mt-1">{t('debuggerPanel.defineVariables')}</div>
              <button
                onClick={() => setShowVariableDialog(true)}
                className="mt-3 px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs flex items-center gap-1 mx-auto"
              >
                <FiPlus className="w-3 h-3" />
                {t('debuggerPanel.createVariable')}
              </button>
            </div>
          ) : filteredProcessVariables.length === 0 ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
              {t('debuggerPanel.variablesMatchQuery', { query: searchQuery })}
            </div>
          ) : (
            <div className="py-2">
              {filteredProcessVariables.map((variable) => (
                <div
                  key={variable.id}
                  className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 group"
                >
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 text-sm">
                    {variable.name}
                  </span>
                  <span className="text-xs text-slate-500 truncate flex-1">
                    {variable.value || <span className="italic">{t('debuggerPanel.empty')}</span>}
                  </span>
                  {getScopeBadge(variable.scope)}
                  <span className="text-xs text-slate-400">{variable.type}</span>
                  <button
                    onClick={() => setDeleteConfirmId(variable.id)}
                    className="p-0.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    title={t('debuggerPanel.deleteVariable')}
                  >
                    <FiTrash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : watchedVars.length === 0 ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
            {t('debuggerPanel.noWatchedVariables')}
            <div className="text-xs mt-1">
              {t('debuggerPanel.variablesWillAppear')}
            </div>
          </div>
        ) : filteredWatchedVars.length === 0 ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
            {t('debuggerPanel.variablesMatchQuery', { query: searchQuery })}
          </div>
        ) : (
          <div className="py-2">
            {filteredWatchedVars.map((variable, index) => (
              <VariableItem
                key={`${variable.name}-${index}`}
                variable={variable}
                watched
                onToggleWatch={() => handleToggleWatch(variable.name)}
              />
            ))}
          </div>
        )}
      </div>

      <VariableDialog
        isOpen={showVariableDialog}
        onClose={() => setShowVariableDialog(false)}
        onCreate={handleCreateVariable}
        existingVariables={processVariables.map((v) => v.name)}
        variables={variableOptions}
      />

      <ConfirmDialog
        open={!!deleteConfirmId}
        title={t('debuggerPanel.deleteVariable')}
        message={t('execution.cannotUndo')}
        confirmLabel={t('actions.delete')}
        destructive
        onConfirm={() => {
          if (deleteConfirmId) removeVariable(deleteConfirmId);
          setDeleteConfirmId(null);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};

export default VariablePanel;
