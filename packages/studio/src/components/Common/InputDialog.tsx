import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface InputDialogProps {
  isOpen: boolean;
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputDialog({
  isOpen,
  title,
  label,
  placeholder = '',
  defaultValue = '',
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const { t } = useTranslation('common');
  const [value, setValue] = useState(defaultValue);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-dialog-title"
        className="w-80 rounded-lg bg-white p-4 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="input-dialog-title" className="text-lg font-medium">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label={t('actions.close')}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            {label}
          </label>
          <input
            type="text"
            className="w-full rounded border px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
            onClick={handleConfirm}
          >
            {t('dialogs.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InputDialog;
