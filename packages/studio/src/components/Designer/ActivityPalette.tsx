import React, { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiSearch, FiChevronDown, FiChevronRight, FiInfo, FiMenu } from 'react-icons/fi';
import {
  FiMonitor,
  FiGlobe,
  FiGrid,
  FiDatabase,
  FiFileText,
  FiSettings,
  FiLock,
  FiFolder,
  FiType,
  FiClock,
  FiBox,
  FiZap,
  FiTable,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useDesigner, type ActivityCategory } from '../../hooks/useDesigner';
import { getActivityDisplayLibrary, type Activity } from '../../types/engine';
import { getLibraryNamespace, getActivityKey } from '../../utils/activityI18n';
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
  descriptionKey: string;
}

const LIBRARY_STYLES: Record<string, LibraryStyle> = {
  BuiltIn: {
    icon: <FiSettings className="w-4 h-4" />,
    color: '#6366f1',
    bgColor: '#EEF2FF',
    descriptionKey: 'palette.descriptions.builtin',
  },
  DesktopUI: {
    icon: <FiMonitor className="w-4 h-4" />,
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    descriptionKey: 'palette.descriptions.desktopUI',
  },
  WebUI: {
    icon: <FiGlobe className="w-4 h-4" />,
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    descriptionKey: 'palette.descriptions.webUI',
  },
  Excel: {
    icon: <FiGrid className="w-4 h-4" />,
    color: '#10B981',
    bgColor: '#ECFDF5',
    descriptionKey: 'palette.descriptions.excel',
  },
  File: {
    icon: <FiFolder className="w-4 h-4" />,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    descriptionKey: 'palette.descriptions.file',
  },
  String: {
    icon: <FiType className="w-4 h-4" />,
    color: '#6366F1',
    bgColor: '#EEF2FF',
    descriptionKey: 'palette.descriptions.string',
  },
  DateTime: {
    icon: <FiClock className="w-4 h-4" />,
    color: '#0EA5E9',
    bgColor: '#F0F9FF',
    descriptionKey: 'palette.descriptions.datetime',
  },
  Variables: {
    icon: <FiBox className="w-4 h-4" />,
    color: '#64748B',
    bgColor: '#F8FAFC',
    descriptionKey: 'palette.descriptions.variables',
  },
  Flow: {
    icon: <FiZap className="w-4 h-4" />,
    color: '#EC4899',
    bgColor: '#FDF2F8',
    descriptionKey: 'palette.descriptions.flow',
  },
  Database: {
    icon: <FiDatabase className="w-4 h-4" />,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    descriptionKey: 'palette.descriptions.database',
  },
  OCR: {
    icon: <FiFileText className="w-4 h-4" />,
    color: '#EC4899',
    bgColor: '#FDF2F8',
    descriptionKey: 'palette.descriptions.ocr',
  },
  Credentials: {
    icon: <FiLock className="w-4 h-4" />,
    color: '#64748B',
    bgColor: '#F8FAFC',
    descriptionKey: 'palette.descriptions.credentials',
  },
  DataFrames: {
    icon: <FiTable className="w-4 h-4" />,
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    descriptionKey: 'palette.descriptions.dataframes',
  },
};


function getLibraryStyle(libraryName: string): LibraryStyle {
  const libDef = LIBRARY_STYLES[libraryName];
  if (libDef) {
    return libDef;
  }
  return {
    icon: <FiSettings className="w-4 h-4" />,
    color: '#6B7280',
    bgColor: '#F9FAFB',
    descriptionKey: 'palette.descriptions.builtin'
  };
}

interface BlockItem {
  type: BlockType;
  category: BlockCategory;
  name?: string;
  nameKey?: string;
  description?: string;
  descriptionKey?: string;
}

const ERROR_HANDLING_BLOCKS: BlockItem[] = [
  { type: 'try-catch', category: 'error-handling', nameKey: 'blocks.tryCatch', descriptionKey: 'blockDescriptions.try-catch' },
  { type: 'throw', category: 'error-handling', nameKey: 'blocks.throw', descriptionKey: 'blockDescriptions.throw' },
];

const VARIABLE_BLOCKS: BlockItem[] = [
  { type: 'assign', category: 'variables', nameKey: 'blocks.assign_var', descriptionKey: 'blockDescriptions.assign' },
];

interface BlockItemProps {
  block: BlockItem;
  onDragStart: (e: React.DragEvent, block: BlockItem) => void;
}

const START_COLOR = { primary: '#22C55E', hover: '#16A34A', border: '#16A34A' };
const END_COLOR = { primary: '#EF4444', hover: '#DC2626', border: '#DC2626' };

const BlockItem: React.FC<BlockItemProps> = ({ block, onDragStart }) => {
  const { t: tBlocks } = useTranslation('blocks');
  const { t: tCommon } = useTranslation('common');
  const getKey = (key: string) => key.replace(/^(blocks|blockDescriptions)\./, '');
  const name = block.nameKey ? tBlocks(getKey(block.nameKey)) : (block.name || '');
  const description = block.descriptionKey ? tCommon(block.descriptionKey) : block.description;
  
  let colors = BLOCK_COLORS[block.category];
  if (block.type === 'start') {
    colors = START_COLOR;
  } else if (block.type === 'end') {
    colors = END_COLOR;
  }
  const icon = BLOCK_ICONS[block.type];
  const tooltip = description ? `${name}

${description}` : name;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-white hover:shadow-sm transition-all group border-l-2"
      style={{ borderLeftColor: colors.primary }}
      draggable
      onDragStart={(e) => onDragStart(e, block)}
      title={tooltip}
    >
      <span
        className="w-6 h-6 flex items-center justify-center rounded-full text-white text-sm flex-shrink-0"
        style={{ backgroundColor: colors.primary }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {description && (
          <div className="text-xs text-slate-500 truncate">{description}</div>
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
  const libraryName = getActivityDisplayLibrary(activity);
  const { t } = useTranslation(getLibraryNamespace(libraryName));
  const { t: tCommon } = useTranslation('common');
  const style = libraryStyle || getLibraryStyle(libraryName);

  const activityKey = getActivityKey(activity.id);
  const displayName = t(`activities.${activityKey}.name`, { defaultValue: activity.name });
  const displayDescription = activity.description
    ? t(`activities.${activityKey}.description`, { defaultValue: activity.description })
    : '';

  const tooltip = displayDescription
    ? `${displayName}\n\n${displayDescription}\n\n${tCommon('palette.library')}: ${libraryName}`
    : `${displayName}\n\n${tCommon('palette.library')}: ${libraryName}`;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-white hover:shadow-sm transition-all border-l-2"
      style={{ borderLeftColor: style.color }}
      draggable
      onDragStart={(e) => onDragStart(e, activity)}
      title={tooltip}
    >
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: style.bgColor, color: style.color }}
      >
        {activity.library.charAt(0)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{displayName}</div>
        {displayDescription && (
          <div className="text-xs text-slate-500 truncate">{displayDescription}</div>
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
  blocksLabel: string;
  t: (key: string) => string;
}

const BlockCategorySection: React.FC<BlockCategorySectionProps> = ({
  categoryKey,
  blocks,
  searchQuery,
  onDragStart,
  blocksLabel,
  t,
}) => {
  const { t: tBlocks } = useTranslation('blocks');
  const [isExpanded, setIsExpanded] = useState(true);
  const category = BLOCK_CATEGORIES[categoryKey];
  const colors = BLOCK_COLORS[categoryKey];

  const getKey = (key: string) => key.replace(/^(blocks|blockDescriptions)\./, '');

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return blocks;
    const query = searchQuery.toLowerCase();
    return blocks.filter(
      (block) =>
        (block.nameKey ? tBlocks(getKey(block.nameKey)) : block.name)?.toLowerCase().includes(query) ||
        (block.descriptionKey ? t(block.descriptionKey) : block.description)?.toLowerCase().includes(query)
    );
  }, [blocks, searchQuery, t, tBlocks, getKey]);

  if (filteredBlocks.length === 0) return null;

  return (
    <div className="category-section">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 rounded border-l-4 transition-colors"
        style={{ color: colors.primary, borderLeftColor: colors.primary }}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`${t(category.nameKey)}, ${filteredBlocks.length} ${blocksLabel}`}
      >
        {isExpanded ? (
          <FiChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <FiChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span aria-hidden="true">{category.icon} {t(category.nameKey)}</span>
        <span
          className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: colors.primary + '20', color: colors.primary }}
          aria-hidden="true"
        >
          {filteredBlocks.length}
        </span>
      </button>
      {isExpanded && (
        <div className="pl-2 pr-1 mt-0.5">
          {filteredBlocks.map((block) => (
            <BlockItem key={block.type} block={block} onDragStart={onDragStart} />
          ))}
        </div>
      )}
    </div>
  );
};

interface ActivityCategorySectionProps {
  id: string;
  category: ActivityCategory;
  searchQuery: string;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
  activitiesLabel: string;
}

const ActivityCategorySection: React.FC<ActivityCategorySectionProps> = ({
  id,
  category,
  searchQuery,
  onDragStart,
  activitiesLabel,
}) => {
  const { t } = useTranslation('common');
  const { t: tLib } = useTranslation(getLibraryNamespace(category.name));
  const translatedLibraryName = tLib('library', { defaultValue: category.name });
  const [isExpanded, setIsExpanded] = useState(true);
  const style = getLibraryStyle(category.name);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

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
    <div ref={setNodeRef} style={dndStyle} className="category-section">
      <div
        className="w-full flex items-center gap-1 px-2 py-1.5 text-sm font-semibold rounded transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4"
        style={{ color: style.color, borderLeftColor: style.color }}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-400 hover:text-slate-600 flex-shrink-0 touch-none p-0.5"
          title={t('palette.dragToReorder')}
          aria-label={t('palette.dragToReorder')}
        >
          <FiMenu className="w-3 h-3" aria-hidden="true" />
        </span>
        <button
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={`${translatedLibraryName}, ${filteredItems.length} ${activitiesLabel}`}
          title={t(style.descriptionKey)}
        >
          {isExpanded ? (
            <FiChevronDown className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          ) : (
            <FiChevronRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="p-1 rounded-full flex-shrink-0" style={{ backgroundColor: style.bgColor }} aria-hidden="true">
            {style.icon}
          </span>
          <span aria-hidden="true" className="truncate">{translatedLibraryName}</span>
          <span
            className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: style.color + '20', color: style.color }}
            aria-hidden="true"
          >
            {filteredItems.length}
          </span>
        </button>
      </div>
      {isExpanded && (
        <div className="pl-2 pr-1 mt-0.5">
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
  const { t } = useTranslation('common');
  const { categories, isLoading } = useDesigner();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const orderedCategories = useMemo(() => {
    if (categoryOrder.length === 0) return categories;
    const map = new Map(categories.map((c) => [c.name, c]));
    const ordered = categoryOrder.map((name) => map.get(name)).filter(Boolean) as typeof categories;
    const remaining = categories.filter((c) => !categoryOrder.includes(c.name));
    return [...ordered, ...remaining];
  }, [categories, categoryOrder]);

  const sortableIds = useMemo(() => orderedCategories.map((c) => c.name), [orderedCategories]);

  const handleDndEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortableIds.indexOf(active.id as string);
      const newIndex = sortableIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      setCategoryOrder(arrayMove(sortableIds, oldIndex, newIndex));
    },
    [sortableIds]
  );

  const blocksLabel = t('palette.blocks');
  const activitiesLabel = t('palette.activities');

  const FLOW_CONTROL_BLOCKS: BlockItem[] = [
    { type: 'start', category: 'flow-control', nameKey: 'blocks.start', descriptionKey: 'blockDescriptions.start' },
    { type: 'end', category: 'flow-control', nameKey: 'blocks.end', descriptionKey: 'blockDescriptions.end' },
    { type: 'if', category: 'flow-control', nameKey: 'blocks.if', descriptionKey: 'blockDescriptions.if' },
    { type: 'switch', category: 'flow-control', nameKey: 'blocks.switch', descriptionKey: 'blockDescriptions.switch' },
    { type: 'while', category: 'flow-control', nameKey: 'blocks.while', descriptionKey: 'blockDescriptions.while' },
    { type: 'for-each', category: 'flow-control', nameKey: 'blocks.forEach', descriptionKey: 'blockDescriptions.for-each' },
    { type: 'parallel', category: 'flow-control', nameKey: 'blocks.parallel', descriptionKey: 'blockDescriptions.parallel' },
    { type: 'retry-scope', category: 'flow-control', nameKey: 'blocks.retryScope', descriptionKey: 'blockDescriptions.retry-scope' },
  ];

  const handleBlockDragStart = (e: React.DragEvent, block: BlockItem) => {
    const blockData = createDefaultBlockData(block.type, `block-${Date.now()}`);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'block', data: blockData }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleActivityDragStart = (e: React.DragEvent, activity: Activity) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'activity', data: activity }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const hasSearchResults = useMemo(() => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const allBlocks = [...FLOW_CONTROL_BLOCKS, ...ERROR_HANDLING_BLOCKS, ...VARIABLE_BLOCKS];
    const blockMatch = allBlocks.some(
      (b) => (b.nameKey ? t(b.nameKey) : b.name)?.toLowerCase().includes(q) || (b.descriptionKey ? t(b.descriptionKey) : b.description)?.toLowerCase().includes(q)
    );
    const activityMatch = categories.some((cat) =>
      cat.items.some(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          getActivityDisplayLibrary(item as Activity).toLowerCase().includes(q)
      )
    );
    return blockMatch || activityMatch;
  }, [searchQuery, categories, FLOW_CONTROL_BLOCKS, t]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold mb-2 text-slate-700">{t('palette.title')}</h2>
        <div className="relative">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('palette.search')}
            aria-label={t('palette.search')}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all duration-150 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {!searchQuery && categories.length > 0 && (
          <div className="px-3 pb-3 mb-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
              <FiInfo className="w-3 h-3" />
              <span className="font-medium">{t('palette.quickStart')}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded" style={{ backgroundColor: '#6366f1' }} />
                {t('palette.quickStartTips.builtin')}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded" style={{ backgroundColor: '#3B82F6' }} />
                {t('palette.quickStartTips.webUI')}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded" style={{ backgroundColor: '#8B5CF6' }} />
                {t('palette.quickStartTips.desktopUI')}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded" style={{ backgroundColor: '#10B981' }} />
                {t('palette.quickStartTips.excel')}
              </div>
            </div>
          </div>
        )}
        {isLoading && (
          <div className="px-3 pb-2 text-xs text-slate-500">{t('palette.loading')}</div>
        )}

        {searchQuery && !hasSearchResults && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <FiSearch className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('palette.noResults')} <span className="font-medium">"{searchQuery}"</span>
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {t('palette.clearSearch')}
            </button>
          </div>
        )}

        {!searchQuery && categories.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('palette.notLoaded')}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {t('palette.startBridge')}
            </p>
          </div>
        )}

        <div className="px-2 mb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {t('palette.flowBlocks')}
          </span>
        </div>

        <BlockCategorySection
          categoryKey="flow-control"
          blocks={FLOW_CONTROL_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
          blocksLabel={blocksLabel}
          t={t}
        />

        <BlockCategorySection
          categoryKey="error-handling"
          blocks={ERROR_HANDLING_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
          blocksLabel={blocksLabel}
          t={t}
        />

        <BlockCategorySection
          categoryKey="variables"
          blocks={VARIABLE_BLOCKS}
          searchQuery={searchQuery}
          onDragStart={handleBlockDragStart}
          blocksLabel={blocksLabel}
          t={t}
        />

        {categories.length > 0 && (
          <div className="px-2 mt-4 mb-1 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {t('palette.sdkActivities')}
            </span>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {orderedCategories.map((category) => (
              <ActivityCategorySection
                key={category.name}
                id={category.name}
                category={category}
                searchQuery={searchQuery}
                onDragStart={handleActivityDragStart}
                activitiesLabel={activitiesLabel}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default ActivityPalette;
