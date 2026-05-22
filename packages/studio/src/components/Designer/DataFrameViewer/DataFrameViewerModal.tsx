import { useEffect, useRef } from 'react';
import { FiX, FiGrid } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { DataFrameViewer } from './index';
import type { DataFrameData } from './index';

interface DataFrameViewerModalProps {
  isOpen: boolean;
  data: DataFrameData | null;
  onClose: () => void;
}

export function DataFrameViewerModal({ isOpen, data, onClose }: DataFrameViewerModalProps) {
  const { t } = useTranslation('common');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-label={t('dataframeViewer.title', { defaultValue: 'DataFrame Viewer' })}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl flex flex-col w-full max-w-5xl h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FiGrid className="text-teal-500" size={16} />
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
              {t('dataframeViewer.title', { defaultValue: 'DataFrame Viewer' })}
            </span>
            {data.name && (
              <span className="font-mono text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded">
                {data.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('actions.close', { defaultValue: 'Close' })}
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <DataFrameViewer data={data} />
        </div>
      </div>
    </div>
  );
}
