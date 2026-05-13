import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCode, FiMoreHorizontal, FiCrosshair, FiPlus, FiX } from 'react-icons/fi';

import VariablePicker from '../../VariablePicker';
import ExpressionEditor from '../../ExpressionEditor';
import FilePicker from '../../FilePicker';
import { FieldHelp } from './FieldHelp';
import SelectorPickerDialog from '../../../SelectorBuilder/SelectorPickerDialog';
import type { ActivityParam } from '../../../../types/engine';
import { stringifyValue, isPathParam, getFileFilters, multilineParamTypes } from '../utils/paramUtils';

const SELECTOR_EXAMPLES = [
  { value: 'button:id=submit', label: 'Click button with id' },
  { value: 'input:class=username', label: 'Input with class' },
  { value: 'div:text=Submit', label: 'Div with text content' },
];

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
  const [selectorDialogOpen, setSelectorDialogOpen] = useState(false);
  const { t } = useTranslation('common');

  const selectorMode: 'web' | 'desktop' = activityLibrary === 'DesktopUI' ? 'desktop' : 'web';

  const isSelectorParam =
    param.name.toLowerCase().includes('selector') ||
    param.name.toLowerCase().includes('locator');

  const commonLabel = (
    <label className="mb-1 flex items-center text-sm font-medium text-slate-600 dark:text-slate-300">
      {param.label}
      {param.required && <span className="ml-1 text-red-500">*</span>}
      {isSelectorParam && (
        <FieldHelp
          title={param.label}
          description={t('propertyEditors.activity.selectorDescription')}
          format="type:attribute=value"
          examples={SELECTOR_EXAMPLES}
        />
      )}
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
          {!param.required && <option value="">{t('propertyEditors.activity.selectPlaceholder')}</option>}
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
          placeholder={param.description || t('propertyEditors.activity.selectParamPlaceholder', { param: param.label.toLowerCase() })}
          title={t('variableNameTooltip', { defaultValue: 'Enter a variable name. Example: my_variable' })}
        />
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  }

  const pathMode = isPathParam(param);
  if (pathMode && param.variadic) {
    const paths: string[] = Array.isArray(value) ? (value as string[]) : value ? [stringifyValue(value)] : [''];
    const updatePaths = (next: string[]) => onChange(param.name, next);
    return (
      <div>
        <label className="mb-1 flex items-center text-sm font-medium text-slate-600 dark:text-slate-300">
          {param.label}
          <span className="ml-2 text-xs font-normal text-slate-400">({paths.length} segment{paths.length !== 1 ? 's' : ''})</span>
        </label>
        <div className="space-y-1.5">
          {paths.map((p, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <div className="flex-1">
                <FilePicker
                  value={p}
                  onChange={(val) => {
                    const next = [...paths];
                    next[i] = val;
                    updatePaths(next);
                  }}
                  mode={pathMode}
                  filters={getFileFilters(param, activityLibrary)}
                  placeholder={i === 0 ? t('propertyEditors.activity.basePathPlaceholder') : t('propertyEditors.activity.segmentPlaceholder', { index: i + 1 })}
                />
              </div>
              {paths.length > 1 && (
                <button
                  type="button"
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  onClick={() => updatePaths(paths.filter((_, idx) => idx !== i))}
                  title={t('removePathSegment', { defaultValue: 'Remove path segment' })}
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
            onClick={() => updatePaths([...paths, ''])}
          >
            <FiPlus className="w-3.5 h-3.5" />
            {t('addPathSegment', { defaultValue: 'Add path segment' })}
          </button>
        </div>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
        <div className="mt-1 text-xs text-slate-400">
          {t('propertyEditors.activity.pathSegmentsHelp')}
        </div>
      </div>
    );
  }

  if (pathMode) {
    return (
      <div>
        {commonLabel}
        <FilePicker
          value={stringifyValue(value)}
          onChange={(val) => onChange(param.name, val)}
          mode={pathMode}
          filters={getFileFilters(param, activityLibrary)}
          placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: param.label.toLowerCase() })}
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
          placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: param.label.toLowerCase() })}
          rows={2}
          title={t('variableNameTooltip', { defaultValue: 'Enter a variable name. Example: my_variable' })}
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
              placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: param.label.toLowerCase() })}
            />
            <button
              type="button"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1 self-start"
              onClick={() => onOpenCodeEditor({ name: param.name, value: codeValue })}
              title={t('propertyEditors.activity.editButton')}
            >
              <FiCode className="w-4 h-4" />
              {t('propertyEditors.activity.editButton')}
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
            title={t('propertyEditors.activity.openInEditorButton')}
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
          title={t('variableNameTooltip', { defaultValue: 'Enter a variable name. Example: my_variable' })}
        />
        {isSelectorParam && (
          <button
            type="button"
            className="px-2 py-1.5 border border-indigo-300 dark:border-indigo-600 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
            onClick={() => setSelectorDialogOpen(true)}
            title={t('propertyEditors.selectorParam.visualPicker')}
          >
            <FiCrosshair className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          onClick={() => onOpenCodeEditor({ name: param.name, value: stringifyValue(value) })}
          title={t('propertyEditors.activity.openInEditorButton')}
        >
          <FiMoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      {param.description && (
        <div className="mt-1 text-xs text-slate-500">{param.description}</div>
      )}
      {selectorDialogOpen && (
        <SelectorPickerDialog
          onSelect={(sel: string) => onChange(param.name, sel)}
          onClose={() => setSelectorDialogOpen(false)}
          mode={selectorMode}
        />
      )}
    </div>
  );
};

export default ActivityParamEditor;
