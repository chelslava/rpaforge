import React, { useState, useMemo } from 'react';
import { FiSearch, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { useDesigner, type ActivityCategory } from '../../hooks/useDesigner';
import type { Activity } from '../../types/engine';

interface ActivityItemProps {
  activity: Activity;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, onDragStart }) => {
  return (
    <div
      className="activity-item flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      draggable
      onDragStart={(e) => onDragStart(e, activity)}
    >
      <span className="text-indigo-500 flex-shrink-0">▶</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{activity.name}</div>
        {activity.description && (
          <div className="text-xs text-slate-500 truncate">{activity.description}</div>
        )}
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{activity.library}</span>
    </div>
  );
};

interface CategorySectionProps {
  category: ActivityCategory;
  searchQuery: string;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({ category, searchQuery, onDragStart }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return category.items;
    const query = searchQuery.toLowerCase();
    return category.items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.library.toLowerCase().includes(query)
    );
  }, [category.items, searchQuery]);

  if (filteredItems.length === 0) return null;

  return (
    <div className="category-section">
      <button
        className="category-header w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <FiChevronDown className="w-4 h-4" />
        ) : (
          <FiChevronRight className="w-4 h-4" />
        )}
        <span>{category.name}</span>
        <span className="ml-auto text-xs text-slate-400">{filteredItems.length}</span>
      </button>
      {isExpanded && (
        <div className="category-items pl-2 pr-1">
          {filteredItems.map((item) => (
            <ActivityItem
              key={`${item.library}.${item.name}`}
              activity={item as Activity}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ActivityPalette: React.FC = () => {
  const { categories } = useDesigner();
  const [searchQuery, setSearchQuery] = useState('');

  const handleDragStart = (e: React.DragEvent, activity: Activity) => {
    e.dataTransfer.setData('application/json', JSON.stringify(activity));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    return categories.filter((category) => {
      const query = searchQuery.toLowerCase();
      return category.items.some(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.library.toLowerCase().includes(query)
      );
    });
  }, [categories, searchQuery]);

  return (
    <div className="activity-palette h-full flex flex-col">
      <div className="palette-header p-2 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold mb-2">Activities</h2>
        <div className="relative">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search activities..."
            className="w-full pl-8 pr-2 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="palette-content flex-1 overflow-y-auto py-2">
        {filteredCategories.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-4">
            No activities found
          </div>
        ) : (
          filteredCategories.map((category) => (
            <CategorySection
              key={category.name}
              category={category}
              searchQuery={searchQuery}
              onDragStart={handleDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityPalette;
