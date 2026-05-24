import React, { useEffect, useMemo } from 'react';
import { FiX, FiSearch, FiGlobe, FiMonitor, FiDatabase, FiFile, FiFolder, FiMail, FiType, FiFileText, FiArrowRight, FiSettings } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import type { TemplateMetadata } from '../../types/template';

const iconMap: Record<string, React.ReactNode> = {
  FiGlobe: <FiGlobe className="w-5 h-5" />,
  FiMonitor: <FiMonitor className="w-5 h-5" />,
  FiDatabase: <FiDatabase className="w-5 h-5" />,
  FiFile: <FiFile className="w-5 h-5" />,
  FiFolder: <FiFolder className="w-5 h-5" />,
  FiMail: <FiMail className="w-5 h-5" />,
  FiType: <FiType className="w-5 h-5" />,
  FiFileText: <FiFileText className="w-5 h-5" />,
  FiSearch: <FiSearch className="w-5 h-5" />,
  FiArrowRight: <FiArrowRight className="w-5 h-5" />,
  FiSettings: <FiSettings className="w-5 h-5" />,
};

interface MarketplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onPreviewTemplate?: (templateId: string) => void;
}

export const MarketplaceDialog: React.FC<MarketplaceDialogProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onPreviewTemplate,
}) => {
  const { t } = useTranslation('common');
  const {
    loadTemplates,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    getFilteredProjectTemplates,
    getCategories,
  } = useMarketplaceStore();

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen, loadTemplates]);

  const filteredTemplates = useMemo(() => getFilteredProjectTemplates(), [
    getFilteredProjectTemplates,
  ]);

  const categories = useMemo(() => getCategories(), [getCategories]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('marketplace.title', 'Template Marketplace')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label={t('actions.close')}
          >
            <FiX className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('marketplace.search', 'Search templates...')}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg border-0 text-slate-900 dark:text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {t('marketplace.all', 'All')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {iconMap[cat.icon] || <FiFile className="w-4 h-4" />}
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <FiSearch className="w-12 h-12 mb-3 opacity-50" />
              <p>{t('marketplace.noResults', 'No templates found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.metadata.id}
                  metadata={template.metadata}
                  onSelect={() => onSelectTemplate(template.metadata.id)}
                  onPreview={() => onPreviewTemplate?.(template.metadata.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TemplateCardProps {
  metadata: TemplateMetadata;
  onSelect: () => void;
  onPreview?: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ metadata, onSelect, onPreview }) => {
  const { t } = useTranslation('common');
  
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
          {iconMap[metadata.icon] || <FiFile className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-slate-900 dark:text-white truncate">
            {metadata.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
            {metadata.description}
          </p>
        </div>
      </div>
      
      {metadata.tags && metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {metadata.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {metadata.author && (
        <div className="text-xs text-slate-400 mt-2">
          by {metadata.author}
        </div>
      )}
      
      <div className="flex gap-2 mt-3">
        <button
          onClick={onSelect}
          className="flex-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {t('marketplace.useTemplate', 'Use Template')}
        </button>
        {onPreview && (
          <button
            onClick={onPreview}
            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {t('marketplace.preview', 'Preview')}
          </button>
        )}
      </div>
    </div>
  );
};

export default MarketplaceDialog;
