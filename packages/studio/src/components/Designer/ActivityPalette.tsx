import React, { useState, useMemo } from 'react';
import { FiSearch, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import {
  FiMonitor,
  FiGlobe,
  FiGrid,
  FiDatabase,
  FiFileText,
  FiSettings,
  FiLock,
} from 'react-icons/fi';
import { useDesigner, type ActivityCategory } from '../../hooks/useDesigner';
import { getActivityDisplayLibrary, type Activity } from '../../types/engine';
import {
  BlockType,
  BlockCategory,
  BLOCK_CATEGORIES,
  BLOCK_COLORS,
  BLOCK_ICONS,
  createDefaultBlockData,
} from '../../types/blocks';

interface LibraryStyle {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const LIBRARY_STYLES: Record<string, LibraryStyle> = {
  BuiltIn: {
    icon: <FiSettings className="w-4 h-4" />,
    color: '#6366f1',
    bgColor: '#EEF2FF',
  },
  DesktopUI: {
    icon: <FiMonitor className="w-4 h-4" />,
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
  },
  WebUI: {
    icon: <FiGlobe className="w-4 h-4" />,
    color: '#3B82F6',
    bgColor: '#EFF6FF',
  },
  Excel: {
    icon: <FiGrid className="w-4 h-4" />,
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  Database: {
    icon: <FiDatabase className="w-4 h-4" />,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  OCR: {
    icon: <FiFileText className="w-4 h-4" />,
    color: '#EC4899',
    bgColor: '#FDF2F8',
  },
  Credentials: {
    icon: <FiLock className="w-4 h-4" />,
    color: '#64748B',
    bgColor: '#F8FAFC',
  },
};

function getLibraryStyle(libraryName: string): LibraryStyle {
  return (
    LIBRARY_STYLES[libraryName] || {
      icon: <FiSettings className="w-4 h-4" />,
      color: '#6B7280',
      bgColor: '#F9FAFB',
    }
  );
}

interface BlockItem {
  type: BlockType;
  category: BlockCategory;
  name: string;
  description?: string;
}

const FLOW_CONTROL_BLOCKS: BlockItem[] = [
  { type: 'start', category: 'flow-control', name: 'Start', description: 'Entry point of the process' },
  { type: 'end', category: 'flow-control', name: 'End', description: 'Exit point of the process' },
  { type: 'if', category: 'flow-control', name: 'If', description: 'Conditional branching' },
  { type: 'switch', category: 'flow-control', name: 'Switch', description: 'Multi-way branching' },
  { type: 'while', category: 'flow-control', name: 'While', description: 'Loop with condition' },
  { type: 'for-each', category: 'flow-control', name: 'For Each', description: 'Iterate over collection' },
  { type: 'parallel', category: 'flow-control', name: 'Parallel', description: 'Execute in parallel' },
  { type: 'retry-scope', category: 'flow-control', name: 'Retry Scope', description: 'Retry on failure' },
];

const ERROR_HANDLING_BLOCKS: BlockItem[] = [
  { type: 'try-catch', category: 'error-handling', name: 'Try Catch', description: 'Handle exceptions' },
  { type: 'throw', category: 'error-handling', name: 'Throw', description: 'Raise an exception' },
];

const VARIABLE_BLOCKS: BlockItem[] = [
  { type: 'assign', category: 'variables', name: 'Assign', description: 'Create or update variable' },
  { type: 'get-variable', category: 'variables', name: 'Get Variable', description: 'Get variable value' },
  { type: 'set-variable', category: 'variables', name: 'Set Variable', description: 'Set variable value' },
];

interface BlockItemProps {
  block: BlockItem;
  onDragStart: (e: React.DragEvent, block: BlockItem) => void;
}

const START_COLOR = { primary: '#22C55E', hover: '#16A34A', border: '#16A34A' };
const END_COLOR = { primary: '#EF4444', hover: '#DC2626', border: '#DC2626' };

const BlockItem: React.FC<BlockItemProps> = ({ block, onDragStart }) => {
  let colors = BLOCK_COLORS[block.category];
  if (block.type === 'start') {
    colors = START_COLOR;
  } else if (block.type === 'end') {
    colors = END_COLOR;
  }
  const icon = BLOCK_ICONS[block.type];

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-slate-100 transition-colors group"
      draggable
      onDragStart={(e) => onDragStart(e, block)}
    >
      <span
        className="w-6 h-6 flex items-center justify-center rounded text-white text-sm"
        style={{ backgroundColor: colors.primary }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{block.name}</div>
        {block.description && (
          <div className="text-xs text-slate-500 truncate">{block.description}</div>
        )}
      </div>
    </div>
  );
};

interface ActivityItemProps {
  activity: Activity;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
  libraryStyle?: LibraryStyle;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, onDragStart, libraryStyle }) => {
  const style = libraryStyle || getLibraryStyle(getActivityDisplayLibrary(activity));
  
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-slate-100 transition-colors"
      draggable
      onDragStart={(e) => onDragStart(e, activity)}
    >
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-base"
        style={{ backgroundColor: style.bgColor, color: style.color }}
      >
        {activity.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{activity.name}</div>
        {activity.description && (
          <div className="text-xs text-slate-500 truncate">{activity.description}</div>
        )}
      </div>
    </div>
  );
};

interface BlockCategorySectionProps {
  categoryKey: BlockCategory;
  blocks: BlockItem[];
  searchQuery: string;
  onDragStart: (e: React.DragEvent, block: BlockItem) => void;
}

const BlockCategorySection: React.FC<BlockCategorySectionProps> = ({
  categoryKey,
  blocks,
  searchQuery,
  onDragStart,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const category = BLOCK_CATEGORIES[categoryKey];
  const colors = BLOCK_COLORS[categoryKey];

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return blocks;
    const query = searchQuery.toLowerCase();
    return blocks.filter(
      (block) =>
        block.name.toLowerCase().includes(query) ||
        block.description?.toLowerCase().includes(query)
    );
  }, [blocks, searchQuery]);

  if (filteredBlocks.length === 0) return null;

  return (
    <div className="category-section">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium hover:bg-slate-100 rounded"
        style={{ color: colors.primary }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <FiChevronDown className="w-4 h-4" />
        ) : (
          <FiChevronRight className="w-4 h-4" />
        )}
        <span>{category.icon} {category.name}</span>
        <span className="ml-auto text-xs text-slate-400">{filteredBlocks.length}</span>
      </button>
      {isExpanded && (
        <div className="pl-2 pr-1">
          {filteredBlocks.map((block) => (
            <BlockItem
              key={block.type}
              block={block}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ActivityCategorySectionProps {
  category: ActivityCategory;
  searchQuery: string;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
}

const ActivityCategorySection: React.FC<ActivityCategorySectionProps> = ({
  category,
  searchQuery,
  onDragStart,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const style = getLibraryStyle(category.name);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return category.items;
    const query = searchQuery.toLowerCase();
    return category.items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        getActivityDisplayLibrary(item).toLowerCase().includes(query)
    );
  }, [category.items, searchQuery]);

  if (filteredItems.length === 0) return null;

  return (
    <div className="category-section">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded transition-colors"
        style={{ color: style.color }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <FiChevronDown className="w-4 h-4" />
        ) : (
          <FiChevronRight className="w-4 h-4" />
        )}
        <span
          className="p-1 rounded"
          style={{ backgroundColor: style.bgColor }}
        >
          {style.icon}
        </span>
        <span>{category.name}</span>
        <span className="ml-auto text-xs opacity-60">{filteredItems.length}</span>
      </button>
      {isExpanded && (
        <div className="pl-2 pr-1">
          {filteredItems.map((item) => (
            <ActivityItem
              key={item.id}
              activity={item as Activity}
              onDragStart={onDragStart}
              libraryStyle={style}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ActivityPalette: React.FC = () => {
  const { categories, isLoading } = useDesigner();
  const [searchQuery, setSearchQuery] = useState('');

  const handleBlockDragStart = (e: React.DragEvent, block: BlockItem) => {
    const blockData = createDefaultBlockData(block.type, `block-${Date.now()}`);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'block', data: blockData }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleActivityDragStart = (e: React.DragEvent, activity: Activity) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'activity', data: activity }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-2 border-b border-slate-200">
        <h2 className="font-semibold mb-2 text-slate-700">Blocks & Activities</h2>
        <div className="relative">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && (
          <div className="px-3 pb-2 text-xs text-slate-500">Loading SDK activities…</div>
        )}

        <div className="px-2 mb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Flow Blocks
          </span>
        </div>

        <BlockCategorySection
          categoryKey="flow-control"
          blocks={FLOW_CONTROL_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
        />

        <BlockCategorySection
          categoryKey="error-handling"
          blocks={ERROR_HANDLING_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
        />

        <BlockCategorySection
          categoryKey="variables"
          blocks={VARIABLE_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
        />

        {categories.length > 0 && (
          <div className="px-2 mt-4 mb-1 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              SDK Activities
            </span>
          </div>
        )}

        {categories.map((category) => (
          <ActivityCategorySection
            key={category.name}
            category={category}
            searchQuery={searchQuery}
            onDragStart={handleActivityDragStart}
          />
        ))}
      </div>
    </div>
  );
};

export default ActivityPalette;
