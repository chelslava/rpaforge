import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch } from 'react-icons/fi';
import type { PageElement } from '../../types/ipc-contracts';

interface ElementTreeViewProps {
  elements: PageElement[];
  onSelectElement: (selector: string) => void;
}

function reliabilityColor(r: number): string {
  if (r > 0.8) return 'bg-green-500';
  if (r > 0.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

function elementLabel(el: PageElement): string {
  const id = el.id ? `#${el.id}` : '';
  const text = el.text ? ` "${el.text.slice(0, 30)}"` : '';
  return `${el.tag}${id}${text}`;
}

const ElementTreeView: React.FC<ElementTreeViewProps> = ({ elements, onSelectElement }) => {
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return elements;
    return elements.filter(
      (el) =>
        el.tag.toLowerCase().includes(q) ||
        (el.id?.toLowerCase().includes(q) ?? false) ||
        (el.text?.toLowerCase().includes(q) ?? false),
    );
  }, [elements, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <FiSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder={t('elementTree.filterByTag')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400 dark:text-slate-500 p-4 text-center">
            {elements.length === 0 ? t('elementTree_clickInspect') : t('elementTree_noMatchFilter')}
          </div>
        ) : (
          <ul className="px-2 py-1 space-y-0.5">
            {filtered.map((el, idx) => (
              <li key={idx}>
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => onSelectElement(el.reliableSelector.value)}
                  title={`${el.reliableSelector.type}: ${el.reliableSelector.value}`}
                >
                  <span
                    className={`flex-shrink-0 w-2 h-2 rounded-full ${reliabilityColor(el.reliableSelector.reliability)}`}
                    title={`Reliability: ${(el.reliableSelector.reliability * 100).toFixed(0)}%`}
                  />
                  <span className="flex-1 font-mono truncate text-slate-700 dark:text-slate-200">
                    {elementLabel(el)}
                  </span>
                  <span className="flex-shrink-0 text-slate-400 dark:text-slate-500">
                    {(el.reliableSelector.reliability * 100).toFixed(0)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ElementTreeView;
