import React from 'react';
import { useTranslation } from 'react-i18next';

import type { BlockData } from '../../../../types/blocks';

export type SimpleFieldType = 'text' | 'textarea' | 'number' | 'select';

export interface SimpleFieldSpec {
  key: string;
  label: string;
  type: SimpleFieldType;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface SimpleFieldsBlockEditorProps {
  blockData: BlockData;
  fields: SimpleFieldSpec[];
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
}

const inputCls =
  'w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100';

/**
 * Generic scalar-field property editor used by AI-era blocks (LLM Decision,
 * Agentic Loop, Approval) whose data models are flat key/value payloads.
 */
const SimpleFieldsBlockEditor: React.FC<SimpleFieldsBlockEditorProps> = ({
  blockData,
  fields,
  onUpdateBlockData,
}) => {
  const { t } = useTranslation('blocks');
  const record = blockData as unknown as Record<string, unknown>;

  const update = (key: string, raw: string, type: SimpleFieldType) => {
    if (type === 'number') {
      const n = parseFloat(raw);
      onUpdateBlockData({ [key]: Number.isFinite(n) ? n : undefined });
      return;
    }
    onUpdateBlockData({ [key]: raw });
  };

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="mb-0.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            {t(f.key, { defaultValue: f.label })}
          </label>
          {f.type === 'textarea' ? (
            <textarea
              className={inputCls}
              rows={3}
              value={String(record[f.key] ?? '')}
              placeholder={f.placeholder}
              onChange={(e) => update(f.key, e.target.value, f.type)}
            />
          ) : f.type === 'select' ? (
            <select
              className={inputCls}
              value={String(record[f.key] ?? '')}
              onChange={(e) => update(f.key, e.target.value, f.type)}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              type={f.type === 'number' ? 'number' : 'text'}
              value={record[f.key] == null ? '' : String(record[f.key])}
              placeholder={f.placeholder}
              onChange={(e) => update(f.key, e.target.value, f.type)}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default SimpleFieldsBlockEditor;
