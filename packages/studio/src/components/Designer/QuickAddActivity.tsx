import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch, FiMonitor, FiGlobe, FiGrid, FiFolder, FiType, FiClock, FiBox, FiZap, FiSettings } from 'react-icons/fi';
import { useDesigner } from '../../hooks/useDesigner';
import type { Activity } from '../../types/engine';

interface QuickAddActivityProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onAddActivity: (activity: Activity, position: { x: number; y: number }) => void;
}

const LIBRARY_ICONS: Record<string, React.ReactNode> = {
  BuiltIn: <FiSettings className="w-4 h-4" />,
  DesktopUI: <FiMonitor className="w-4 h-4" />,
  WebUI: <FiGlobe className="w-4 h-4" />,
  Excel: <FiGrid className="w-4 h-4" />,
  File: <FiFolder className="w-4 h-4" />,
  String: <FiType className="w-4 h-4" />,
  DateTime: <FiClock className="w-4 h-4" />,
  Variables: <FiBox className="w-4 h-4" />,
  Flow: <FiZap className="w-4 h-4" />,
};

const QuickAddActivity: React.FC<QuickAddActivityProps> = ({
  isOpen,
  position,
  onClose,
  onAddActivity,
}) => {
  const { t } = useTranslation('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { categories } = useDesigner();

  const filteredActivities = useMemo(() => {
    if (!search.trim()) {
      return categories.flatMap((cat) => cat.items).slice(0, 20);
    }

    const query = search.toLowerCase();
    return categories
      .flatMap((cat) => cat.items)
      .filter(
        (activity) =>
          activity.name.toLowerCase().includes(query) ||
          activity.library.toLowerCase().includes(query) ||
          activity.description?.toLowerCase().includes(query)
      )
      .slice(0, 20);
  }, [categories, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredActivities.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredActivities[selectedIndex]) {
            onAddActivity(filteredActivities[selectedIndex], position);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActivities, selectedIndex, onAddActivity, position, onClose]);

  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (activity: Activity) => {
      onAddActivity(activity, position);
      onClose();
    },
    [onAddActivity, position, onClose]
  );

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('quickAdd.searchActivities')}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden"
      style={{
        left: Math.min(position.x, window.innerWidth - 340),
        top: Math.min(position.y, window.innerHeight - 400),
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <FiSearch className="w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('quickAdd.searchActivities')}
          className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
        />
        <span className="text-xs text-slate-400">{t('quickAdd.escToClose')}</span>
      </div>

      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {filteredActivities.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-slate-500">
            {t('quickAdd.noActivities')}
          </div>
        ) : (
          filteredActivities.map((activity, index) => (
            <button
              key={`${activity.library}.${activity.id}`}
              onClick={() => handleSelect(activity)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-slate-100 text-slate-600">
                {LIBRARY_ICONS[activity.library] || <FiSettings className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{activity.name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {activity.library}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <span className="mr-2">{t('quickAdd.navigate')}</span>
        <span>{t('quickAdd.enterSelect')}</span>
      </div>
    </div>
  );
};

export default QuickAddActivity;
