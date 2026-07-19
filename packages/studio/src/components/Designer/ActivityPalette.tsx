import React, { useState, useMemo, useCallback, useRef, useEffect, useContext } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FiSearch,
  FiChevronDown,
  FiChevronRight,
  FiInfo,
  FiMenu,
  FiAlertCircle,
  FiSettings,
  FiClock,
  FiLock,
} from 'react-icons/fi';
import EmptyState from '../Common/EmptyState';
import { ActivityPaletteSkeleton } from '../Common/Loading';
import { useTranslation } from 'react-i18next';
import { useDesignerStore } from '../../stores/designerStore';
import { useDesigner, type ActivityCategory } from '../../hooks/useDesigner';
import { getActivityDisplayLibrary, type Activity } from '../../domain/activity';
import { getLibraryNamespace, getActivityKey } from '../../utils/activityI18n';
import {
  BlockType,
  BlockCategory,
  BLOCK_CATEGORIES,
  BLOCK_COLORS,
  BLOCK_ICONS,
  createDefaultBlockData,
} from '../../types/blocks';
import { LIBRARY_STYLES, type LibraryStyle } from '../../styles/libraryStyles';

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-ui-highlight text-ui-highlight-text rounded-sm px-0">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function colorMix(color: string, amount = 16): string {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`;
}


function getLibraryStyle(libraryName: string): LibraryStyle {
  const libDef = LIBRARY_STYLES[libraryName];
  if (libDef) {
    return libDef;
  }
  return {
    icon: FiSettings,
    color: 'var(--color-library-default)',
    bgColor: 'var(--color-library-default-soft)',
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

interface BlockItemProps {
  block: BlockItem;
  onDragStart: (e: React.DragEvent, block: BlockItem) => void;
  onInsert: (block: BlockItem) => void;
}

const START_COLOR = {
  primary: 'var(--color-block-start)',
  hover: 'var(--color-block-start-hover)',
  border: 'var(--color-block-start-border)',
};
const END_COLOR = {
  primary: 'var(--color-block-end)',
  hover: 'var(--color-block-end-hover)',
  border: 'var(--color-block-end-border)',
};

const BlockItem: React.FC<BlockItemProps> = ({ block, onDragStart, onInsert }) => {
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
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-ui-surface hover:shadow-sm transition-all group border-l-2"
      style={{ borderLeftColor: colors.primary }}
      draggable
      onDragStart={(e) => onDragStart(e, block)}
      title={tooltip}
      role="button"
      tabIndex={0}
      aria-label={tooltip}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onInsert(block);
      }}
    >
      <span
        className="w-6 h-6 flex items-center justify-center rounded-full text-ui-text-inverse text-sm flex-shrink-0"
        style={{ backgroundColor: colors.primary }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {description && (
          <div className="text-xs text-ui-text-muted truncate">{description}</div>
        )}
      </div>
    </div>
  );
};

interface ActivityTooltipProps {
  activity: Activity;
  displayName: string;
  displayDescription: string;
  libraryName: string;
  style: LibraryStyle;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string, options?: Record<string, unknown>) => string;
  id: string;
}

const ActivityTooltip: React.FC<ActivityTooltipProps> = ({
  activity,
  displayName,
  displayDescription,
  libraryName,
  style,
  anchorRef,
  t,
  id,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 8 });
  }, [anchorRef]);

  if (!pos) return null;

  const visibleParams = activity.params?.slice(0, 6) ?? [];
  const extraParams = (activity.params?.length ?? 0) - visibleParams.length;

  return (
    <div
      id={id}
      role="tooltip"
      className="fixed z-50 w-64 bg-ui-surface text-ui-text rounded-lg border border-ui-border shadow-xl p-3 pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ backgroundColor: style.bgColor, color: style.color }}
        >
          {activity.library.charAt(0)}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">{displayName}</div>
          <div className="text-[10px] text-ui-text-muted truncate">{libraryName}</div>
        </div>
      </div>

      {displayDescription && (
        <p className="text-xs text-ui-text-muted mb-2 leading-relaxed">{displayDescription}</p>
      )}

      {visibleParams.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-ui-text-muted uppercase tracking-wide mb-1">{t('activityDoc.parameters', { ns: 'common' })}</div>
          <div className="space-y-0.5">
            {visibleParams.map((param) => (
              <div key={param.name} className="flex items-center gap-1.5 text-[11px]">
                <span className="text-ui-text font-medium truncate max-w-[110px]">{param.name}</span>
                <span className="text-ui-text-subtle">·</span>
                <span className="text-ui-primary font-mono text-[10px]">{param.type}</span>
                {param.required && <span className="text-ui-danger text-[10px]">*</span>}
              </div>
            ))}
            {extraParams > 0 && (
              <div className="text-[10px] text-ui-text-subtle">{t('palette.moreParams', { ns: 'common', count: extraParams })}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ActivityItemProps {
  activity: Activity;
  onDragStart: (e: React.DragEvent, activity: Activity) => void;
  libraryStyle?: LibraryStyle;
  searchQuery?: string;
  isFocused?: boolean;
  onFocus?: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onInsert: (activity: Activity) => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  onDragStart,
  libraryStyle,
  searchQuery = '',
  isFocused = false,
  onFocus,
  isFavorite,
  onToggleFavorite,
  onInsert,
}) => {
  const libraryName = getActivityDisplayLibrary(activity);
  const { t } = useTranslation(getLibraryNamespace(libraryName));
  const { t: tPalette } = useTranslation('common');
  const style = libraryStyle || getLibraryStyle(libraryName);
  const ref = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const activityKey = getActivityKey(activity.id);
  const displayName = t(`activities.${activityKey}.name`, { defaultValue: activity.name });
  const displayDescription = activity.description
    ? t(`activities.${activityKey}.description`, { defaultValue: activity.description })
    : '';
  const tooltipId = `activity-tooltip-${activity.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused]);

  return (
    <div
      ref={ref}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-ui-surface hover:shadow-sm transition-all border-l-2 ${isFocused ? 'ring-1 ring-ui-primary' : ''}`}
      style={{
        borderLeftColor: style.color,
        ...(isFocused ? { backgroundColor: colorMix(style.color, 12) } : {}),
      }}
      draggable
      onDragStart={(e) => onDragStart(e, activity)}
      onMouseEnter={() => { onFocus?.(); setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => { onFocus?.(); setShowTooltip(true); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setShowTooltip(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if ((event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        onInsert(activity);
      }}
      role="button"
      tabIndex={0}
      aria-label={displayName}
      aria-describedby={`palette-keyboard-help${showTooltip ? ` ${tooltipId}` : ''}`}
    >
      <span
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: style.bgColor, color: style.color }}
      >
        {activity.library.charAt(0)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          <HighlightText text={displayName} query={searchQuery} />
        </div>
        {displayDescription && (
          <div className="text-xs text-ui-text-muted truncate">
            <HighlightText text={displayDescription} query={searchQuery} />
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
          className={`text-lg px-1 leading-none rounded transition-colors ${isFavorite ? 'text-yellow-500' : 'text-slate-400 dark:text-slate-500 hover:text-yellow-500'}`}
        title={isFavorite ? tPalette('palette.unfavorite', { defaultValue: 'Remove from favorites' }) : tPalette('palette.favorite', { defaultValue: 'Add to favorites' })}
        aria-label={isFavorite ? tPalette('palette.unfavorite', { defaultValue: 'Remove from favorites' }) : tPalette('palette.favorite', { defaultValue: 'Add to favorites' })}
        aria-pressed={isFavorite}
      >
        {isFavorite ? '★' : '☆'}
      </button>
      {showTooltip && (
        <ActivityTooltip
          activity={activity}
          displayName={displayName}
          displayDescription={displayDescription}
          libraryName={libraryName}
          style={style}
          anchorRef={ref}
          t={t}
          id={tooltipId}
        />
      )}
    </div>
  );
};

const getKey = (key: string) => key.replace(/^(blocks|blockDescriptions)\./, '');

interface BlockCategorySectionProps {
  categoryKey: BlockCategory;
  blocks: BlockItem[];
  searchQuery: string;
  onDragStart: (e: React.DragEvent, block: BlockItem) => void;
  onInsert: (block: BlockItem) => void;
  blocksLabel: string;
  t: (key: string) => string;
}

const BlockCategorySection: React.FC<BlockCategorySectionProps> = ({
  categoryKey,
  blocks,
  searchQuery,
  onDragStart,
  onInsert,
  blocksLabel,
  t,
}) => {
  const { t: tBlocks } = useTranslation('blocks');
  const [isExpanded, setIsExpanded] = useState(true);
  const category = BLOCK_CATEGORIES[categoryKey];
  const colors = BLOCK_COLORS[categoryKey];

  const filteredBlocks = useMemo(() => {
    if (!searchQuery) return blocks;
    const query = searchQuery.toLowerCase();
    return blocks.filter(
      (block) =>
        (block.nameKey ? tBlocks(getKey(block.nameKey)) : block.name)?.toLowerCase().includes(query) ||
        (block.descriptionKey ? t(block.descriptionKey) : block.description)?.toLowerCase().includes(query)
    );
  }, [blocks, searchQuery, t, tBlocks]);

  if (filteredBlocks.length === 0) return null;

  return (
    <div className="category-section">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-semibold hover:bg-ui-surface-hover rounded border-l-4 transition-colors"
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
          style={{ backgroundColor: colorMix(colors.primary, 14), color: colors.primary }}
          aria-hidden="true"
        >
          {filteredBlocks.length}
        </span>
      </button>
      {isExpanded && (
        <div className="pl-2 pr-1 mt-0.5">
          {filteredBlocks.map((block) => (
            <BlockItem key={block.type} block={block} onDragStart={onDragStart} onInsert={onInsert} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Virtualization types & constants ───────────────────────────────────────

type FlatPaletteItem =
  | { kind: 'category-header'; category: ActivityCategory; id: string; filteredCount: number; style: LibraryStyle }
  | { kind: 'activity-row'; activity: Activity; style: LibraryStyle };

const OVERSCAN_COUNT = 5;

// ─── Context: passes palette state into the Virtuoso Header component ────────

interface PaletteCtxValue {
  searchQuery: string;
  categories: ActivityCategory[];
  isLoading: boolean;
  error: unknown;
  hasSearchResults: boolean;
  paletteTab: 'all' | 'recent' | 'favorites';
  handleBlockDragStart: (e: React.DragEvent, block: BlockItem) => void;
  handleBlockInsert: (block: BlockItem) => void;
  setSearchQuery: (q: string) => void;
  refreshActivities: () => void;
}

const PaletteContext = React.createContext<PaletteCtxValue | null>(null);

// ─── Virtuoso Header: non-virtualized content at top of scroll container ─────

const PaletteVirtuosoHeader: React.FC = () => {
  const { t } = useTranslation('common');
  const ctx = useContext(PaletteContext);
  if (!ctx) return null;

  const {
    searchQuery,
    categories,
    isLoading,
    error,
    hasSearchResults,
    paletteTab,
    handleBlockDragStart,
    handleBlockInsert,
    setSearchQuery,
    refreshActivities,
  } = ctx;

  const blocksLabel = t('palette.blocks');

  if (paletteTab !== 'all') {
    return null;
  }

  return (
    <div className="pt-2">
      {!searchQuery && categories.length > 0 && (
        <div className="px-3 pb-3 mb-2 border-b border-ui-border">
          <div className="flex items-center gap-1 text-xs text-ui-text-muted mb-2">
            <FiInfo className="w-3 h-3" aria-hidden="true" />
            <span className="font-medium">{t('palette.quickStart')}</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-ui-text-muted">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded" style={{ backgroundColor: getLibraryStyle('BuiltIn').color }} />
              {t('palette.quickStartTips.builtin')}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded" style={{ backgroundColor: getLibraryStyle('WebUI').color }} />
              {t('palette.quickStartTips.webUI')}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded" style={{ backgroundColor: getLibraryStyle('DesktopUI').color }} />
              {t('palette.quickStartTips.desktopUI')}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded" style={{ backgroundColor: getLibraryStyle('Excel').color }} />
              {t('palette.quickStartTips.excel')}
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <ActivityPaletteSkeleton aria-label={t('palette.loadingActivities')} />
      )}

      {!!error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <FiAlertCircle className="w-8 h-8 text-ui-danger mb-2" aria-hidden="true" />
          <p className="text-sm text-ui-text font-medium mb-1">{t('palette.loadError')}</p>
          <p className="text-xs text-ui-text-subtle mb-3">{t('palette.loadErrorHint')}</p>
          <button
            onClick={() => refreshActivities()}
            className="px-3 py-1.5 text-sm bg-ui-surface-muted text-ui-primary rounded-md hover:bg-ui-surface-hover transition-colors font-medium"
          >
            {t('actions.retry')}
          </button>
        </div>
      )}

      {searchQuery && !hasSearchResults && (
        <div className="px-2">
          <EmptyState
            icon={<FiSearch className="w-8 h-8 text-ui-text-subtle" />}
            title={t('palette.noResults')}
            description={`${t('palette.noResults')} "${searchQuery}"`}
            action={{
              label: t('palette.clearSearch'),
              onClick: () => setSearchQuery(''),
              variant: 'ghost',
              size: 'sm',
            }}
          />
        </div>
      )}

      {!searchQuery && categories.length === 0 && !isLoading && (
        <div className="px-2">
          <EmptyState
            icon={<FiInfo className="w-8 h-8 text-ui-text-subtle" />}
            title={t('palette.notLoaded')}
            description={t('palette.startBridge')}
          />
        </div>
      )}

      <div className="px-2 mb-1">
        <span className="text-xs font-semibold text-ui-text-subtle uppercase tracking-wide">
          {t('palette.flowBlocks')}
        </span>
      </div>

      <BlockCategorySection
        categoryKey="flow-control"
        blocks={FLOW_CONTROL_BLOCKS}
        searchQuery={searchQuery}
        onDragStart={handleBlockDragStart}
        onInsert={handleBlockInsert}
        blocksLabel={blocksLabel}
        t={t}
      />

      <BlockCategorySection
        categoryKey="error-handling"
        blocks={ERROR_HANDLING_BLOCKS}
        searchQuery={searchQuery}
        onDragStart={handleBlockDragStart}
        onInsert={handleBlockInsert}
        blocksLabel={blocksLabel}
        t={t}
      />

      <BlockCategorySection
        categoryKey="variables"
        blocks={VARIABLE_BLOCKS}
        searchQuery={searchQuery}
        onDragStart={handleBlockDragStart}
        onInsert={handleBlockInsert}
        blocksLabel={blocksLabel}
        t={t}
      />

      {categories.length > 0 && (
        <div className="px-2 mt-4 mb-1 pt-2 border-t border-ui-border">
          <span className="text-xs font-semibold text-ui-text-subtle uppercase tracking-wide">
            {t('palette.sdkActivities')}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Category header row rendered as a flat Virtuoso item ────────────────────

interface VirtualCategoryHeaderProps {
  category: ActivityCategory;
  style: LibraryStyle;
  filteredCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  activitiesLabel: string;
}

const VirtualCategoryHeader: React.FC<VirtualCategoryHeaderProps> = ({
  category,
  style,
  filteredCount,
  isExpanded,
  onToggle,
  activitiesLabel,
}) => {
  const { t } = useTranslation('common');
  const { t: tLib } = useTranslation(getLibraryNamespace(category.name));
  const translatedLibraryName = tLib('library', { defaultValue: category.name });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.name,
  });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={dndStyle} className="category-section">
      <div
        className="w-full flex items-center gap-1 px-2 py-1.5 text-sm font-semibold rounded transition-colors hover:bg-ui-surface-hover border-l-4"
        style={{ color: style.color, borderLeftColor: style.color }}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-ui-text-subtle hover:text-ui-text flex-shrink-0 touch-none p-0.5"
          title={t('palette.dragToReorder')}
          aria-label={t('palette.dragToReorder')}
          aria-keyshortcuts="Space ArrowUp ArrowDown"
        >
          <FiMenu className="w-3 h-3" aria-hidden="true" />
        </span>
        <button
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={`${translatedLibraryName}, ${filteredCount} ${activitiesLabel}`}
          title={t(style.descriptionKey)}
        >
          {isExpanded ? (
            <FiChevronDown className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          ) : (
            <FiChevronRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          )}
          <span
            className="p-1 rounded-full flex-shrink-0"
            style={{ backgroundColor: style.bgColor }}
            aria-hidden="true"
          >
            <style.icon className="w-4 h-4" />
          </span>
          <span aria-hidden="true" className="truncate">{translatedLibraryName}</span>
          <span
            className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorMix(style.color, 14), color: style.color }}
            aria-hidden="true"
          >
            {filteredCount}
          </span>
        </button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ActivityPalette: React.FC = () => {
  const { t } = useTranslation('common');
  const { categories, isLoading, error, refreshActivities, addActivity, addBlock, selectedNode } = useDesigner();
  console.log('[ActivityPalette] Render: categories.length=', categories?.length || 0, 'isLoading=', isLoading, 'error=', error);
  const searchQuery = useDesignerStore((s) => s.activitySearchQuery);
  const setSearchQuery = useDesignerStore((s) => s.setActivitySearchQuery);
  const paletteTab = useDesignerStore((s) => s.paletteTab);
  const setPaletteTab = useDesignerStore((s) => s.setPaletteTab);
  const recentActivityIds = useDesignerStore((s) => s.recentActivityIds);
  const favoriteActivityIds = useDesignerStore((s) => s.favoriteActivityIds);
  const addRecentActivity = useDesignerStore((s) => s.addRecentActivity);
  const toggleFavoriteActivity = useDesignerStore((s) => s.toggleFavoriteActivity);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [focusedActivityId, setFocusedActivityId] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isCategoryExpanded = useCallback(
    (name: string) => expandedCategories[name] !== false,
    [expandedCategories]
  );

  const toggleCategory = useCallback((name: string) => {
    setExpandedCategories((prev) => ({ ...prev, [name]: prev[name] === false }));
  }, []);

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

  const dndAnnouncements: Announcements = useMemo(() => ({
    onDragStart: ({ active }) => `${active.id} selected. Use arrow keys to move it, then press Space to drop.`,
    onDragOver: ({ active, over }) => over ? `${active.id} is over position ${sortableIds.indexOf(String(over.id)) + 1} of ${sortableIds.length}.` : undefined,
    onDragEnd: ({ active, over }) => over ? `${active.id} moved to position ${sortableIds.indexOf(String(over.id)) + 1} of ${sortableIds.length}.` : `${active.id} was dropped.`,
    onDragCancel: ({ active }) => `${active.id} was dropped.`,
  }), [sortableIds]);

  const activitiesLabel = t('palette.activities');

  // Per-category filtered items (avoids redundant filter passes)
  const categoryFilteredItems = useMemo(() => {
    return orderedCategories.map((category) => {
      if (!searchQuery) return category.items;
      const q = searchQuery.toLowerCase();
      return category.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          getActivityDisplayLibrary(item as Activity).toLowerCase().includes(q)
      );
    });
   }, [orderedCategories, searchQuery]);

   const findActivityById = useCallback((activityId: string): Activity | undefined => {
     for (const cat of orderedCategories) {
       const found = cat.items.find((item) => item.id === activityId);
       if (found) return found as Activity;
     }
     return undefined;
   }, [orderedCategories]);

   const flatItems = useMemo((): FlatPaletteItem[] => {
     if (paletteTab === 'recent') {
       const recentItems: FlatPaletteItem[] = [];
       for (const activityId of recentActivityIds) {
         const activity = findActivityById(activityId);
         if (activity) {
           recentItems.push({
             kind: 'activity-row',
             activity,
             style: getLibraryStyle(activity.library),
           });
         }
       }
       return recentItems;
     }

     if (paletteTab === 'favorites') {
       // Favorites tab: grouped by category (like 'all' but filtered to favorites)
        const items: FlatPaletteItem[] = [];
        
        orderedCategories.forEach((category) => {
         const allItems = category.items as Activity[];
         const favoriteItems = allItems.filter((item) => favoriteActivityIds.includes(item.id));
         
         if (favoriteItems.length === 0) return;
         
         const isCategoryExpandedForFavorites = expandedCategories[`fav-${category.name}`] !== false;
         
         const style = getLibraryStyle(category.name);
         items.push({
           kind: 'category-header',
           category,
           id: `fav-${category.name}`,
           filteredCount: favoriteItems.length,
           style,
         });
         
         if (isCategoryExpandedForFavorites) {
           for (const item of favoriteItems) {
             items.push({ kind: 'activity-row', activity: item, style });
           }
         }
       });
       
       return items;
     }

     const items: FlatPaletteItem[] = [];
     orderedCategories.forEach((category, idx) => {
       const filtered = categoryFilteredItems[idx];
       if (filtered.length === 0) return;
       const style = getLibraryStyle(category.name);
       items.push({
         kind: 'category-header',
         category,
         id: category.name,
         filteredCount: filtered.length,
         style,
       });
       if (isCategoryExpanded(category.name)) {
         for (const item of filtered) {
           items.push({ kind: 'activity-row', activity: item as Activity, style });
         }
       }
     });
     return items;
   }, [paletteTab, recentActivityIds, favoriteActivityIds, findActivityById, orderedCategories, categoryFilteredItems, isCategoryExpanded, expandedCategories]);

   // All matching activity IDs for keyboard navigation (includes collapsed categories)
  const allFilteredActivityIds = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const ids: string[] = [];
    for (const cat of orderedCategories) {
      for (const item of cat.items) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          getActivityDisplayLibrary(item as Activity).toLowerCase().includes(q)
        ) {
          ids.push(item.id);
        }
      }
    }
    return ids;
  }, [searchQuery, orderedCategories]);

  // Scroll virtuoso to keep focused item visible
  useEffect(() => {
    if (!focusedActivityId) return;
    const flatIndex = flatItems.findIndex(
      (item) => item.kind === 'activity-row' && item.activity.id === focusedActivityId
    );
    if (flatIndex !== -1 && virtuosoRef.current?.scrollToIndex) {
      virtuosoRef.current.scrollToIndex({ index: flatIndex, behavior: 'smooth' });
    }
  }, [focusedActivityId, flatItems]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!searchQuery || allFilteredActivityIds.length === 0) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = allFilteredActivityIds.indexOf(focusedActivityId);
        let nextId: string;
        if (e.key === 'ArrowDown') {
          const nextIdx = currentIdx < allFilteredActivityIds.length - 1 ? currentIdx + 1 : 0;
          nextId = allFilteredActivityIds[nextIdx];
        } else {
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : allFilteredActivityIds.length - 1;
          nextId = allFilteredActivityIds[prevIdx];
        }
        setFocusedActivityId(nextId);
        // Auto-expand the category if the target item is currently collapsed
        for (const cat of orderedCategories) {
          if (cat.items.some((i) => i.id === nextId)) {
            setExpandedCategories((prev) => ({ ...prev, [cat.name]: true }));
            break;
          }
        }
      }
    },
    [searchQuery, allFilteredActivityIds, focusedActivityId, orderedCategories]
  );

  const handleBlockDragStart = useCallback((e: React.DragEvent, block: BlockItem) => {
    const blockData = createDefaultBlockData(block.type, `block-${Date.now()}`);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'block', data: blockData }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const insertionPosition = useMemo(
    () => ({ x: selectedNode?.position.x ?? 80, y: (selectedNode?.position.y ?? 80) + (selectedNode ? 120 : 0) }),
    [selectedNode]
  );

  const handleBlockInsert = useCallback((block: BlockItem) => {
    addBlock(block.type, insertionPosition);
  }, [addBlock, insertionPosition]);

  const handleActivityInsert = useCallback((activity: Activity) => {
    addActivity({ ...activity, position: insertionPosition });
  }, [addActivity, insertionPosition]);

  const handleActivityDragStart = useCallback((e: React.DragEvent, activity: Activity) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'activity', data: activity }));
    e.dataTransfer.effectAllowed = 'copy';
    addRecentActivity(activity.id);
  }, [addRecentActivity]);

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
  }, [searchQuery, categories, t]);

   const paletteCtxValue = useMemo<PaletteCtxValue>(
     () => ({
       searchQuery,
       categories,
       isLoading,
       error,
       hasSearchResults,
       paletteTab,
       handleBlockDragStart,
       handleBlockInsert,
       setSearchQuery,
       refreshActivities,
     }),
     [searchQuery, categories, isLoading, error, hasSearchResults, paletteTab, handleBlockDragStart, handleBlockInsert, setSearchQuery, refreshActivities]
   );

  const renderFlatItem = useCallback(
    (_index: number, item: FlatPaletteItem) => {
      if (item.kind === 'category-header') {
        const isFavExpanded = paletteTab === 'favorites' ? expandedCategories[`fav-${item.category.name}`] !== false : isCategoryExpanded(item.category.name);
        return (
          <VirtualCategoryHeader
            category={item.category}
            style={item.style}
            filteredCount={item.filteredCount}
            isExpanded={isFavExpanded}
            onToggle={() => {
              if (paletteTab === 'favorites') {
                setExpandedCategories((prev) => ({ ...prev, [`fav-${item.category.name}`]: prev[`fav-${item.category.name}`] === false }));
              } else {
                toggleCategory(item.category.name);
              }
            }}
            activitiesLabel={activitiesLabel}
          />
        );
      }
      return (
        <div className="pl-2 pr-1">
          <ActivityItem
            activity={item.activity}
            onDragStart={handleActivityDragStart}
            libraryStyle={item.style}
            searchQuery={searchQuery}
            isFocused={focusedActivityId === item.activity.id}
            onFocus={() => setFocusedActivityId(item.activity.id)}
            isFavorite={favoriteActivityIds.includes(item.activity.id)}
            onToggleFavorite={() => toggleFavoriteActivity(item.activity.id)}
            onInsert={handleActivityInsert}
          />
        </div>
      );
    },
      [
      paletteTab,
      expandedCategories,
      isCategoryExpanded,
      toggleCategory,
      activitiesLabel,
      handleActivityDragStart,
      searchQuery,
      focusedActivityId,
      favoriteActivityIds,
      toggleFavoriteActivity,
      handleActivityInsert,
    ]
  );

  return (
    <div className="h-full flex flex-col">
      <p id="palette-keyboard-help" className="sr-only">
        {t('palette.keyboardInsertHint', { defaultValue: 'Press Enter or Space on an item to insert it below the selected node, or at the canvas origin.' })}
      </p>
      <div className="p-2 border-b border-ui-border">
        <h2 className="font-semibold mb-2 text-ui-text">{t('palette.title')}</h2>
        <div className="relative">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ui-text-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('palette.search')}
            aria-label={t('palette.search')}
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-ui-border rounded bg-ui-surface text-ui-text placeholder:text-ui-text-subtle focus:outline-none focus:ring-2 focus:ring-ui-primary focus:border-ui-primary transition-all duration-150"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setFocusedActivityId(''); }}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      </div>

       <div className="flex border-b border-ui-border">
        <button
          onClick={() => setPaletteTab('all')}
           className={`flex-1 py-1.5 text-xs font-medium transition-colors ${paletteTab === 'all' ? 'text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
        >
          {t('palette.all')}
        </button>
        <button
          onClick={() => setPaletteTab('recent')}
           className={`flex-1 py-1.5 text-xs font-medium transition-colors ${paletteTab === 'recent' ? 'text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
        >
          {t('palette.recent')}
        </button>
        <button
          onClick={() => setPaletteTab('favorites')}
           className={`flex-1 py-1.5 text-xs font-medium transition-colors ${paletteTab === 'favorites' ? 'text-ui-primary border-b-2 border-ui-primary' : 'text-ui-text-muted hover:text-ui-text'}`}
        >
          {t('palette.favorites')}
        </button>
      </div>

      <PaletteContext.Provider value={paletteCtxValue}>
        {paletteTab === 'recent' && flatItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<FiClock className="w-8 h-8 text-ui-text-subtle" />}
              title={t('palette.noRecent')}
              description=""
            />
          </div>
        ) : paletteTab === 'favorites' && flatItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<FiLock className="w-8 h-8 text-ui-text-subtle" />}
              title={t('palette.noFavorites')}
              description=""
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDndEnd}
            accessibility={{ announcements: dndAnnouncements }}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <Virtuoso
                ref={virtuosoRef}
                style={{ flex: 1 }}
                components={{ Header: PaletteVirtuosoHeader }}
                data={flatItems}
                itemContent={renderFlatItem}
                increaseViewportBy={OVERSCAN_COUNT * 36}
              />
            </SortableContext>
          </DndContext>
        )}
      </PaletteContext.Provider>
    </div>
  );
};

export default ActivityPalette;
