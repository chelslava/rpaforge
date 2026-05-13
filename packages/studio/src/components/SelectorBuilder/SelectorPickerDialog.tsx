import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import SelectorBuilderPanel from './SelectorBuilderPanel';
import { useTranslation } from 'react-i18next';

interface SelectorPickerDialogProps {
  onSelect: (selector: string) => void;
  onClose: () => void;
  mode?: 'web' | 'desktop';
}

const SelectorPickerDialog: React.FC<SelectorPickerDialogProps> = ({ onSelect, onClose, mode = 'web' }) => {
  const { t } = useTranslation('blocks');
  const title = mode === 'desktop' ? t('selectorSpy.desktop') : t('selectorSpy.web');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSelect = (selector: string) => {
    onSelect(selector);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-[760px] h-[520px] flex flex-col rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {title}
          </span>
          <button
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SelectorBuilderPanel onSelect={handleSelect} mode={mode} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SelectorPickerDialog;
