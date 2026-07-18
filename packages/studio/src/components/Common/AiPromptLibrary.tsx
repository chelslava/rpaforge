import React, { useState, useEffect, useRef } from 'react';
import {
  FiSearch,
  FiX,
  FiTrash2,
  FiDownload,
  FiUpload,
  FiGrid,
  FiFileText,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { usePromptLibraryStore } from '../../stores/promptLibraryStore';
import type { AiPrompt, AiImportResult } from '../../types/ai';
import { toast } from 'sonner';

interface AiPromptLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelectPrompt: (promptText: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Web Automation': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Data Processing': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'File Operations': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Email Automation': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'General': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const getCategoryColor = (category?: string): string => {
  if (!category) return CATEGORY_COLORS['General'];
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['General'];
};

const AiPromptLibrary: React.FC<AiPromptLibraryProps> = ({ open, onClose, onSelectPrompt }) => {
  const { t } = useTranslation('common');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<string>('');
  const [showImportError, setShowImportError] = useState(false);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);

  const { prompts, searchPrompts, deletePrompt, exportPrompts, importPrompts } = usePromptLibraryStore();

  const filteredPrompts = searchPrompts(searchQuery);

  const categories = [...new Set(prompts.map((p) => p.category).filter((c): c is string => !!c))];

  const handlePromptSelect = (prompt: AiPrompt) => {
    onSelectPrompt(prompt.prompt);
    onClose();
  };

  const handleDelete = (id: string) => {
    deletePrompt(id);
    toast.success(t('promptLibrary.promptDeleted'));
  };

  const handleExport = () => {
    const json = exportPrompts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(t('promptLibrary.exportedSuccessfully'));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const result: AiImportResult = importPrompts(content);

      if (result.success) {
        toast.success(
          result.count > 0
            ? t('promptLibrary.importedSuccessfully', { count: result.count })
            : t('promptLibrary.noNewPrompts')
        );
      } else {
        toast.error(t('promptLibrary.importFailed'));
        setShowImportError(true);
        setImportErrorDetails(result.errors || [t('promptLibrary.unknownError')]);
      }
    } catch (error) {
      toast.error(t('promptLibrary.importFailed'));
    } finally {
      e.target.value = '';
    }
  };

  const filteredByCategory = searchCategory
    ? filteredPrompts.filter((p) => p.category === searchCategory)
    : filteredPrompts;

  useEffect(() => {
    if (open) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('promptLibrary.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label={t('actions.close')}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
  
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t('promptLibrary.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <select
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">{t('promptLibrary.allCategories')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

  
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FiDownload className="w-4 h-4" />
              {t('promptLibrary.exportAll')}
            </button>
            <button
              onClick={handleImportClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FiUpload className="w-4 h-4" />
              {t('promptLibrary.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

  
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setSearchCategory(searchCategory === cat ? '' : cat)
                }
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  searchCategory === cat
                    ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-800'
                    : ''
                } ${getCategoryColor(cat)}`}
              >
                {cat}
              </button>
            ))}
          </div>

  
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredByCategory.map((prompt) => (
              <div
                key={prompt.id}
                className="group relative bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors flex flex-col gap-2"
              >

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900 dark:text-white text-sm truncate pr-6">
                        {prompt.name}
                      </h3>
                      {prompt.builtin && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded">
                          {t('promptLibrary.builtin')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                      {prompt.description}
                    </p>
                  </div>
                  {!prompt.builtin && (
                    <button
                      onClick={() => handleDelete(prompt.id)}
                      className="absolute top-3 right-3 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title={t('actions.delete')}
                      aria-label={t('actions.delete')}
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>


                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600/50 mt-auto">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      getCategoryColor(prompt.category)
                    }`}
                  >
                    {prompt.category || t('promptLibrary.general')}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <span>{t('promptLibrary.usage')}: {prompt.usageCount || 0}</span>
                  </div>
                </div>


                <button
                  onClick={() => handlePromptSelect(prompt)}
                  className="absolute inset-0 w-full h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                  aria-label={`${t('promptLibrary.selectPrompt')} ${prompt.name}`}
                />
              </div>
            ))}
          </div>

          {filteredByCategory.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FiGrid className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {searchQuery
                  ? t('promptLibrary.noSearchResults')
                  : t('promptLibrary.noPrompts')}
              </p>
            </div>
          )}


          {filteredByCategory.length > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              {t('promptLibrary.promptCount', { count: filteredByCategory.length })}
            </p>
          )}
        </div>
      </div>


      {showImportError && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <FiX className="w-5 h-5" />
                {t('promptLibrary.importFailed')}
              </h3>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto">
              {importErrorDetails.map((error, index) => (
                <p key={index} className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                  • {error}
                </p>
              ))}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setShowImportError(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                {t('actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiPromptLibrary;
