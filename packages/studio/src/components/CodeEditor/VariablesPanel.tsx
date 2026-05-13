import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiChevronDown, FiSearch } from 'react-icons/fi';
import { useVariableStore, type ProcessVariable } from '../../stores/variableStore';
import { useDiagramStore } from '../../stores/diagramStore';

interface VariablesPanelProps {
  isOpen: boolean;
  onClose?: () => void;
  onInsertVariable?: (name: string) => void;
}

const VariablesPanel: React.FC<VariablesPanelProps> = ({ isOpen, onInsertVariable }) => {
  const { t } = useTranslation('common');
  const allVariables = useVariableStore((state) => state.variables);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set(['process']));

  const variables = useMemo(() => {
    if (!project?.id) return allVariables;
    if (!activeDiagramId) return allVariables.filter(v => v.projectId === project.id && v.scope === 'process');
    return allVariables.filter(
      (v) =>
        v.projectId === project.id &&
        (v.scope === 'process' || v.diagramId === activeDiagramId)
    );
  }, [allVariables, project?.id, activeDiagramId]);

  const toggleScope = (scope: string) => {
    setExpandedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const filteredVariables = variables.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.description && v.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const groupedByScope = filteredVariables.reduce<Record<string, ProcessVariable[]>>(
    (acc, variable) => {
      const scope = variable.scope || 'process';
      if (!acc[scope]) {
        acc[scope] = [];
      }
      acc[scope].push(variable);
      return acc;
    },
    {}
  );

  const scopeLabels: Record<string, string> = {
    process: t('variablesPanel_processVariables'),
    task: t('variablesPanel_taskVariables'),
  };

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      string: 'text-green-600 dark:text-green-400',
      number: 'text-blue-600 dark:text-blue-400',
      boolean: 'text-orange-600 dark:text-orange-400',
      list: 'text-pink-600 dark:text-pink-400',
      dict: 'text-indigo-600 dark:text-indigo-400',
      secret: 'text-red-600 dark:text-red-400',
      any: 'text-slate-500 dark:text-slate-400',
    };
    return colors[type.toLowerCase()] || colors.any;
  };

  const getTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      string: '"S"',
      number: '#',
      boolean: 'T/F',
      list: '[ ]',
      dict: '{ }',
      secret: '***',
      any: '?',
    };
    return icons[type.toLowerCase()] || '?';
  };

  if (!isOpen) return null;

  if (variables.length === 0) {
    return (
      <div className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <div className="mb-2">{t('variablesPanel_noVariables')}</div>
          <div className="text-xs">{t('codeEditor.variablesPanel.addVariablesHint')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
          {t('variablesPanel_variablesCount', { count: variables.length })}
        </h3>
      </div>

      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('codeEditor.variablesPanel.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedByScope).map(([scope, scopeVariables]) => (
          <div key={scope}>
            <button
              onClick={() => toggleScope(scope)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <span className="text-slate-400">
                {expandedScopes.has(scope) ? (
                  <FiChevronDown className="w-4 h-4" />
                ) : (
                  <FiChevronRight className="w-4 h-4" />
                )}
              </span>
              <span>{scopeLabels[scope] || scope}</span>
              <span className="ml-auto text-xs text-slate-400">{scopeVariables.length}</span>
            </button>

            {expandedScopes.has(scope) && (
              <div className="pb-1">
                {scopeVariables.map((variable) => (
                  <button
                    key={variable.id}
                    onClick={() => onInsertVariable?.(variable.name)}
                    className="w-full text-left px-4 py-2 pl-8 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 group"
                    title={variable.description || `Click to insert ${variable.name}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 group-hover:underline">
                        {variable.name}
                      </span>
                      <span className={`text-xs font-mono ${getTypeColor(variable.type)}`}>
                        {getTypeIcon(variable.type)} {variable.type}
                      </span>
                    </div>
                    {variable.value && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                        = {variable.value.length > 30 ? variable.value.slice(0, 30) + '...' : variable.value}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {Object.keys(groupedByScope).length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No variables found
          </div>
        )}
      </div>
    </div>
  );
};

export default VariablesPanel;
