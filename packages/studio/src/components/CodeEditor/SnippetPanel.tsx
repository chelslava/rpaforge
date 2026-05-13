import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiChevronDown, FiX } from 'react-icons/fi';
import { snippetCategories, type Snippet } from './data/snippets';

interface SnippetPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (snippet: Snippet) => void;
}

const SnippetPanel: React.FC<SnippetPanelProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
}) => {
  const { t } = useTranslation('common');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(snippetCategories.map((c) => c.id))
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const filteredCategories = snippetCategories.map((category) => ({
    ...category,
    snippets: category.snippets.filter(
      (snippet) =>
        snippet.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snippet.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snippet.category.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((category) => category.snippets.length > 0);

  if (!isOpen) return null;

  return (
    <div className="absolute left-0 top-full mt-1 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
          RPA Snippets
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
        >
          <FiX className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <input
          type="text"
          placeholder={t('codeEditor.snippetPanel.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200"
        />
      </div>

      <div className="max-h-80 overflow-y-auto">
        {filteredCategories.map((category) => (
          <div key={category.id}>
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <span className="text-base">{category.icon}</span>
              <span className="flex-1 text-left">{category.name}</span>
              {expandedCategories.has(category.id) ? (
                <FiChevronDown className="w-4 h-4" />
              ) : (
                <FiChevronRight className="w-4 h-4" />
              )}
            </button>

            {expandedCategories.has(category.id) && (
              <div className="pb-1">
                {category.snippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    onClick={() => {
                      onInsertSnippet(snippet);
                      onClose();
                    }}
                    className="w-full text-left px-4 py-2 pl-10 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-900 dark:text-slate-200">
                        {snippet.label}
                      </span>
                      {snippet.library && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400">
                          {snippet.library}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {snippet.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
            No snippets found
          </div>
        )}
      </div>
    </div>
  );
};

export default SnippetPanel;
