import React, { useState, useMemo } from 'react';
import { FiX, FiEye, FiEyeOff } from 'react-icons/fi';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { Variable } from '../../types/engine';

const VariableItem: React.FC<{
  variable: Variable;
  depth?: number;
  watched?: boolean;
  onToggleWatch?: () => void;
}> = ({ variable, depth = 0, watched = false, onToggleWatch }) => {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const hasChildren = variable.children && variable.children.length > 0;

  const valueDisplay = useMemo(() => {
    if (variable.value === null) return 'null';
    if (variable.value === undefined) return 'undefined';
    if (typeof variable.value === 'string') return `"${variable.value}"`;
    if (typeof variable.value === 'object') return '{...}';
    return String(variable.value);
  }, [variable.value]);

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
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren ? (
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
            title={watched ? 'Remove from watch' : 'Add to watch'}
          >
            {watched ? <FiEye className="w-3 h-3" /> : <FiEyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
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
  const {
    variables,
    watchedVariables,
    addWatchedVariable,
    removeWatchedVariable,
    clearWatchedVariables,
  } = useDebuggerStore();

  const [activeTab, setActiveTab] = useState<'variables' | 'watch'>('variables');

  const watchedVars = useMemo(() => {
    return variables.filter((v) => watchedVariables.has(v.name));
  }, [variables, watchedVariables]);

  const handleToggleWatch = (name: string) => {
    if (watchedVariables.has(name)) {
      removeWatchedVariable(name);
    } else {
      addWatchedVariable(name);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
          <button
            className={`px-2 py-1 text-sm rounded ${
              activeTab === 'variables'
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('variables')}
          >
            Variables
          </button>
          <button
            className={`px-2 py-1 text-sm rounded ${
              activeTab === 'watch'
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab('watch')}
          >
            Watch {watchedVariables.size > 0 && `(${watchedVariables.size})`}
          </button>
        </div>
        {activeTab === 'watch' && watchedVariables.size > 0 && (
          <button
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
            onClick={clearWatchedVariables}
            title="Clear all watches"
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'variables' ? (
          variables.length === 0 ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
              No variables available
              <div className="text-xs mt-1">Variables will appear during debugging</div>
            </div>
          ) : (
            <div className="py-2">
              {variables.map((variable, index) => (
                <VariableItem
                  key={`${variable.name}-${index}`}
                  variable={variable}
                  watched={watchedVariables.has(variable.name)}
                  onToggleWatch={() => handleToggleWatch(variable.name)}
                />
              ))}
            </div>
          )
        ) : watchedVars.length === 0 ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
            No watched variables
            <div className="text-xs mt-1">
              Click the eye icon on variables to add them to watch
            </div>
          </div>
        ) : (
          <div className="py-2">
            {watchedVars.map((variable, index) => (
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
    </div>
  );
};

export default VariablePanel;
