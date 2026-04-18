import React from 'react';
import { FiCode, FiMoreHorizontal } from 'react-icons/fi';

import VariablePicker from '../../VariablePicker';
import ExpressionEditor from '../../ExpressionEditor';
import FilePicker from '../../FilePicker';
import type { ActivityParam } from '../../../../types/engine';
import { stringifyValue, isPathParam, getFileFilters, multilineParamTypes } from '../utils/paramUtils';

export interface VariableOption {
  name: string;
  type: string;
  scope: string;
  value?: string;
}

export interface ActivityParamEditorProps {
  param: ActivityParam;
  value: unknown;
  onChange: (paramName: string, value: unknown) => void;
  variables: VariableOption[];
  onCreateNew: () => void;
  onOpenCodeEditor: (param: { name: string; value: string }) => void;
  activityLibrary?: string;
}

const ActivityParamEditor: React.FC<ActivityParamEditorProps> = ({
  param,
  value,
  onChange,
  variables,
  onCreateNew,
  onOpenCodeEditor,
  activityLibrary,
}) => {
  const commonLabel = (
    <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
      {param.label}
      {param.required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );

  if (param.options.length > 0) {
    return (
      <div>
        {commonLabel}
        <select
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={stringifyValue(value)}
          onChange={(event) => onChange(param.name, event.target.value)}
        >
          {!param.required && <option value="">Select…</option>}
          {param.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  if (param.type === 'boolean') {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(param.name, event.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {param.label}
          </span>
        </label>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  if (param.type === 'variable') {
    return (
      <div>
        {commonLabel}
        <VariablePicker
          value={stringifyValue(value)}
          onChange={(nextValue) => onChange(param.name, nextValue)}
          variables={variables}
          onCreateNew={onCreateNew}
          placeholder={param.description || `Select ${param.label.toLowerCase()}...`}
        />
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  const pathMode = isPathParam(param);
  if (pathMode) {
    return (
      <div>
        {commonLabel}
        <FilePicker
          value={stringifyValue(value)}
          onChange={(val) => onChange(param.name, val)}
          mode={pathMode}
          filters={getFileFilters(param, activityLibrary)}
          placeholder={param.description || `Enter ${param.label.toLowerCase()}...`}
        />
      </div>
    );
  }

  if (param.type === 'expression') {
    return (
      <div>
        {commonLabel}
        <ExpressionEditor
          value={stringifyValue(value)}
          onChange={(val) => onChange(param.name, val)}
          variables={variables}
          onCreateNew={onCreateNew}
          placeholder={param.description || `Enter ${param.label.toLowerCase()}...`}
          rows={2}
        />
      </div>
    );
  }

  if (multilineParamTypes.includes(param.type)) {
    if (param.type === 'code') {
      const codeValue = stringifyValue(value) || stringifyValue(param.default) || '';
      const lineCount = (codeValue.match(/\n/g) || []).length + 1;
      return (
        <div>
          {commonLabel}
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-y rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
              rows={lineCount > 3 ? 3 : lineCount}
              value={codeValue}
              onChange={(event) => onChange(param.name, event.target.value)}
              placeholder={param.description || `Enter ${param.label.toLowerCase()}...`}
            />
            <button
              type="button"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1 self-start"
              onClick={() => onOpenCodeEditor({ name: param.name, value: codeValue })}
              title="Open in code editor"
            >
              <FiCode className="w-4 h-4" />
              Edit
            </button>
          </div>
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }
    return (
      <div>
        {commonLabel}
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-y rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
            rows={3}
            value={stringifyValue(value)}
            onChange={(event) => onChange(param.name, event.target.value)}
          />
          <button
            type="button"
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 self-start"
            onClick={() => onOpenCodeEditor({ name: param.name, value: stringifyValue(value) })}
            title="Open in editor"
          >
            <FiMoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  if (param.type === 'integer' || param.type === 'float') {
    return (
      <div>
        {commonLabel}
        <input
          type="number"
          step={param.type === 'float' ? 'any' : '1'}
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={stringifyValue(value)}
          onChange={(event) =>
            onChange(
              param.name,
              param.type === 'float'
                ? Number.parseFloat(event.target.value || '0')
                : Number.parseInt(event.target.value || '0', 10)
            )
          }
        />
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      {commonLabel}
      <div className="flex gap-2">
        <input
          type={param.type === 'secret' ? 'password' : 'text'}
          className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={stringifyValue(value)}
          onChange={(event) => onChange(param.name, event.target.value)}
        />
        <button
          type="button"
          className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          onClick={() => onOpenCodeEditor({ name: param.name, value: stringifyValue(value) })}
          title="Open in editor"
        >
          <FiMoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      {param.description && (
        <div className="mt-1 text-xs text-slate-500">{param.description}</div>
      )}
    </div>
  );
};

export default ActivityParamEditor;
