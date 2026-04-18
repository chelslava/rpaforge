import React, { useState, useEffect } from 'react';
import { FiX, FiPlus, FiEye, FiEyeOff } from 'react-icons/fi';

import ExpressionEditor from './ExpressionEditor';
import type { VariableInfo } from './VariablePicker';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface VariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'list' | 'dict' | 'secret' | 'any';
  value: string;
  scope: 'process' | 'task';
  description?: string;
}

interface VariableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (variable: VariableDefinition) => void;
  existingVariables?: string[];
  variables?: VariableInfo[];
  editVariable?: VariableDefinition | null;
}

const VariableDialog: React.FC<VariableDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
  existingVariables = [],
  variables = [],
  editVariable = null,
}) => {
  const [name, setName] = useState(editVariable?.name || '');
  const [type, setType] = useState<VariableDefinition['type']>(editVariable?.type || 'string');
  const [value, setValue] = useState(editVariable?.value || '');
  const [scope, setScope] = useState<VariableDefinition['scope']>(editVariable?.scope || 'task');
  const [description, setDescription] = useState(editVariable?.description || '');
  const [showValue, setShowValue] = useState(type === 'secret');
  const [error, setError] = useState<string | null>(null);

  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const validateName = (n: string): boolean => {
    if (!n.trim()) {
      setError('Variable name is required');
      return false;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) {
      setError('Variable name must be a valid Python identifier (letters, numbers, underscores, cannot start with number)');
      return false;
    }
    if (existingVariables.includes(n) && !editVariable) {
      setError('Variable with this name already exists');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName(name)) return;

    onCreate({
      name: name.trim(),
      type,
      value,
      scope,
      description: description.trim() || undefined,
    });

    if (!editVariable) {
      setName('');
      setValue('');
      setDescription('');
    }
    onClose();
  };

  if (!isOpen) return null;

  const typeOptions = [
    { value: 'any', label: 'Any', icon: '⬡' },
    { value: 'string', label: 'String', icon: '📝' },
    { value: 'number', label: 'Number', icon: '🔢' },
    { value: 'boolean', label: 'Boolean', icon: '✓' },
    { value: 'list', label: 'List', icon: '📋' },
    { value: 'dict', label: 'Dictionary', icon: '📖' },
    { value: 'secret', label: 'Secret', icon: '🔒' },
  ];

  const scopeOptions = [
    { value: 'process', label: 'Process', description: 'Available throughout the entire process' },
    { value: 'task', label: 'Task', description: 'Available only within the current task' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variable-dialog-title"
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="variable-dialog-title" className="text-lg font-semibold">
            {editVariable ? 'Edit Variable' : 'Create Variable'}
          </h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="variable-name" className="block text-sm font-medium mb-1">Name</label>
            <input
              id="variable-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                validateName(e.target.value);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
              placeholder="variable_name"
              autoFocus
              aria-describedby={error ? 'variable-name-error' : undefined}
            />
            {error && <p id="variable-name-error" className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium mb-1">Type</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Variable type">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setType(opt.value as VariableDefinition['type']);
                    if (opt.value === 'secret') setShowValue(true);
                  }}
                  className={`p-2 border rounded text-sm flex items-center gap-1 justify-center ${
                    type === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                      : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="variable-value" className="block text-sm font-medium mb-1">
              Value
              {type === 'secret' && (
                <button
                  type="button"
                  className="ml-2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowValue(!showValue)}
                  aria-label={showValue ? 'Hide value' : 'Show value'}
                >
                  {showValue ? <FiEyeOff className="w-4 h-4 inline" /> : <FiEye className="w-4 h-4 inline" />}
                </button>
              )}
            </label>
            {type === 'any' ? (
              <ExpressionEditor
                value={value}
                onChange={setValue}
                variables={variables}
                onCreateNew={() => {}}
                placeholder="Any expression or value"
                rows={2}
              />
            ) : type === 'boolean' ? (
              <select
                id="variable-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
              >
                <option value="True">True</option>
                <option value="False">False</option>
              </select>
            ) : type === 'list' ? (
              <textarea
                id="variable-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-mono text-sm"
                placeholder='["item1", "item2", "item3"]'
                rows={3}
              />
            ) : type === 'dict' ? (
              <textarea
                id="variable-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-mono text-sm"
                placeholder='{"key": "value"}'
                rows={3}
              />
            ) : (
              <input
                id="variable-value"
                type={type === 'secret' && showValue ? 'text' : type === 'secret' ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                placeholder={type === 'number' ? '0' : 'value'}
              />
            )}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium mb-1">Scope</legend>
            <div className="space-y-2" role="radiogroup" aria-label="Variable scope">
              {scopeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${
                    scope === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900'
                      : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={opt.value}
                    checked={scope === opt.value}
                    onChange={() => setScope(opt.value as VariableDefinition['scope'])}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="variable-description" className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              id="variable-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
              placeholder="Variable description..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !!error}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <FiPlus className="w-4 h-4" />
              {editVariable ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VariableDialog;
