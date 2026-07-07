import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCode, FiMoreHorizontal, FiCrosshair, FiPlus, FiX, FiZap } from 'react-icons/fi';

import VariablePicker from '../../VariablePicker';
import ExpressionEditor from '../../ExpressionEditor';
import FilePicker from '../../FilePicker';
import { FieldHelp } from './FieldHelp';
import SelectorPickerDialog from '../../../SelectorBuilder/SelectorPickerDialog';
import type { ActivityParam } from '../../../../domain/activity';
import { getLibraryNamespace, getActivityKey } from '../../../../utils/activityI18n';
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
  activityId?: string;
  aiSuggestedValue?: string;
}

const ActivityParamEditor: React.FC<ActivityParamEditorProps> = ({
  param,
  value,
  onChange,
  variables,
  onCreateNew,
  onOpenCodeEditor,
  activityLibrary,
  activityId,
  aiSuggestedValue,
}) => {
  const [selectorDialogOpen, setSelectorDialogOpen] = useState(false);
  const { t } = useTranslation('common');
  const { t: tActivity } = useTranslation(getLibraryNamespace(activityLibrary || ''));
  const activityKey = activityId ? getActivityKey(activityId) : '';
  const paramLabel = activityKey
    ? tActivity(`activities.${activityKey}.params.${param.name}.label`, { defaultValue: param.label || param.name })
    : (param.label || param.name);
  const paramDescription = activityKey && param.description
    ? tActivity(`activities.${activityKey}.params.${param.name}.description`, { defaultValue: param.description })
    : (param.description || '');

  const selectorMode: 'web' | 'desktop' = activityLibrary === 'DesktopUI' ? 'desktop' : 'web';

  const isSelectorParam =
    param.name.toLowerCase().includes('selector') ||
    param.name.toLowerCase().includes('locator');

  const commonLabel = (
    <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
      {paramLabel}
      {param.required && <span className="ml-1 text-red-500">*</span>}
      {isSelectorParam && (
        <FieldHelp
          title={paramLabel}
          description={t('propertyEditors.activity.selectorDescription')}
          format="type:attribute=value"
          examples={SELECTOR_EXAMPLES}
        />
      )}
    </label>
  );

  const hasAiSuggestion = aiSuggestedValue !== undefined && value === undefined;

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
          {param.options.map((option) => {
            const optionLabel = activityKey
              ? tActivity(`activities.${activityKey}.params.${param.name}.options.${option}`, { defaultValue: option })
              : option;
            return (
              <option key={option} value={option}>
                {optionLabel}
              </option>
            );
          })}
        </select>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
            {paramLabel}
          </span>
        </label>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
          placeholder={param.description || t('propertyEditors.activity.selectParamPlaceholder', { param: paramLabel.toLowerCase() })}
          title={t('variableNameTooltip', { defaultValue: 'Enter a variable name. Example: my_variable' })}
        />
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
          {paramLabel}
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
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
          placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: paramLabel.toLowerCase() })}
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
          placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: paramLabel.toLowerCase() })}
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
              placeholder={param.description || t('propertyEditors.activity.enterParamPlaceholder', { param: paramLabel.toLowerCase() })}
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
            <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
          <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
        )}
      </div>
    );
  }

  return (
    <div className={hasAiSuggestion ? 'relative' : ''}>
      {commonLabel}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={param.type === 'secret' ? 'password' : 'text'}
            className={`w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 ${
              hasAiSuggestion ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            value={hasAiSuggestion ? aiSuggestedValue! : stringifyValue(value)}
            onFocus={() => {
              if (hasAiSuggestion) {
                onChange(param.name, aiSuggestedValue);
              }
            }}
            title={t('variableNameTooltip', { defaultValue: 'Enter a variable name. Example: my_variable' })}
          />
          {hasAiSuggestion && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 rounded pointer-events-none">
              <FiZap className="w-3 h-3" />
              AI
            </span>
          )}
        </div>
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
        <div className="mt-1 text-xs text-slate-500">{paramDescription}</div>
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
