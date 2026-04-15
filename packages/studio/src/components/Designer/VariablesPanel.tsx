import React, { useState, useMemo } from 'react';
import { FiChevronDown, FiChevronRight, FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { useVariableStore, type ProcessVariable } from '../../stores/variableStore';
import VariableDialog, { type VariableDefinition } from './VariableDialog';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'any':
      return '⬡';
    case 'string':
      return '📝';
    case 'number':
      return '🔢';
    case 'boolean':
      return '✓';
    case 'list':
      return '📋';
    case 'dict':
      return '📖';
    case 'secret':
      return '🔒';
    default:
      return '📦';
  }
};

const getScopeBadge = (scope: string) => {
  const colors: Record<string, string> = {
    process: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    task: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${colors[scope] || colors.task}`}>
      {scope}
    </span>
  );
};

interface VariablesPanelProps {
  defaultExpanded?: boolean;
}

const VariablesPanel: React.FC<VariablesPanelProps> = ({ defaultExpanded = true }) => {
  const { variables, addVariable, removeVariable } = useVariableStore();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [editingVariable, setEditingVariable] = useState<ProcessVariable | null>(null);

  const variableOptions = useMemo(
    () =>
      variables.map((variable) => ({
        name: variable.name,
        type: variable.type,
        scope: variable.scope,
        value: variable.value,
      })),
    [variables]
  );

  const handleCreateVariable = (definition: VariableDefinition) => {
    if (editingVariable) {
      removeVariable(editingVariable.id);
    }
    addVariable(definition);
    setEditingVariable(null);
  };

  const handleEditVariable = (variable: ProcessVariable) => {
    setEditingVariable(variable);
    setShowVariableDialog(true);
  };

  const handleDeleteVariable = (id: string) => {
    removeVariable(id);
  };

  const groupedVariables = useMemo(() => {
    const groups: Record<string, ProcessVariable[]> = {
      process: [],
      task: [],
    };
    
    for (const variable of variables) {
      if (!groups[variable.scope]) {
        groups[variable.scope] = [];
      }
      groups[variable.scope].push(variable);
    }
    
    return groups;
  }, [variables]);

  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <FiChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <FiChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Variables
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{variables.length}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingVariable(null);
              setShowVariableDialog(true);
            }}
            className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded"
            title="Add variable"
          >
            <FiPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-64 overflow-y-auto">
          {variables.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <div className="text-xs text-slate-400 mb-2">No variables defined</div>
              <button
                onClick={() => {
                  setEditingVariable(null);
                  setShowVariableDialog(true);
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                + Add first variable
              </button>
            </div>
          ) : (
            <div className="py-1">
              {(['process', 'task'] as const).map((scope) => {
                const scopeVars = groupedVariables[scope];
                if (!scopeVars || scopeVars.length === 0) return null;
                
                return (
                  <div key={scope}>
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400 font-medium">
                      {scope}
                    </div>
                    {scopeVars.map((variable) => (
                      <div
                        key={variable.id}
                        className="group flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="text-sm">{getTypeIcon(variable.type)}</span>
                        <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400 truncate flex-1">
                          {variable.name}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-[60px]">
                          {variable.value || '-'}
                        </span>
                        {getScopeBadge(variable.scope)}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditVariable(variable)}
                            className="p-0.5 text-slate-400 hover:text-indigo-500"
                            title="Edit"
                          >
                            <FiEdit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteVariable(variable.id)}
                            className="p-0.5 text-slate-400 hover:text-red-500"
                            title="Delete"
                          >
                            <FiTrash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <VariableDialog
        isOpen={showVariableDialog}
        onClose={() => {
          setShowVariableDialog(false);
          setEditingVariable(null);
        }}
        onCreate={handleCreateVariable}
        existingVariables={variables.filter(v => v.id !== editingVariable?.id).map((v) => v.name)}
        variables={variableOptions}
        editVariable={editingVariable ? {
          name: editingVariable.name,
          type: editingVariable.type,
          value: editingVariable.value,
          scope: editingVariable.scope,
          description: editingVariable.description,
        } : null}
      />
    </div>
  );
};

export default VariablesPanel;
