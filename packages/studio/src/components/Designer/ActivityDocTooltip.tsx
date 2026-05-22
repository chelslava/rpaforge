import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Activity } from '../../types/engine';
import { getActivityDisplayLibrary } from '../../types/engine';
import { getLibraryNamespace, getActivityKey } from '../../utils/activityI18n';

interface TooltipPosition {
  top: number;
  left: number;
}

interface ActivityDocTooltipProps {
  activity: Activity;
  children: React.ReactElement;
}

const PARAM_TYPE_COLORS: Record<string, string> = {
  string: 'bg-library-webui-soft text-library-webui',
  integer: 'bg-library-desktopui-soft text-library-desktopui',
  float: 'bg-library-desktopui-soft text-library-desktopui',
  boolean: 'bg-library-file-soft text-library-file',
  variable: 'bg-library-excel-soft text-library-excel',
  expression: 'bg-library-datetime-soft text-library-datetime',
  secret: 'bg-library-http-soft text-library-http',
  code: 'bg-ui-surface-muted text-ui-text',
  list: 'bg-library-dataframes-soft text-library-dataframes',
  dict: 'bg-library-builtin-soft text-library-builtin',
  dataframe: 'bg-library-flow-soft text-library-flow',
};

const TooltipContent: React.FC<{ activity: Activity; pos: TooltipPosition; tooltipId: string }> = ({ activity, pos, tooltipId }) => {
  const libraryName = getActivityDisplayLibrary(activity);
  const { t } = useTranslation(getLibraryNamespace(libraryName));
  const { t: tCommon } = useTranslation('common');

  const activityKey = getActivityKey(activity.id);
  const displayName = t(`activities.${activityKey}.name`, { defaultValue: activity.name });
  const displayDescription = activity.description
    ? t(`activities.${activityKey}.description`, { defaultValue: activity.description })
    : '';

  const visibleParams = activity.params?.filter((p) => p.name && p.type !== 'code') ?? [];

  return ReactDOM.createPortal(
    <div
      id={tooltipId}
      className="fixed z-[9999] w-72 rounded-lg border border-ui-border bg-ui-surface text-sm shadow-xl pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
      role="tooltip"
    >
      <div className="px-3 py-2 border-b border-ui-border">
        <div className="font-semibold text-ui-text leading-tight">{displayName}</div>
        <div className="text-xs text-ui-text-muted mt-0.5">{tCommon('palette.library')}: {libraryName}</div>
      </div>

      {displayDescription && (
        <div className="px-3 py-2 text-ui-text leading-snug border-b border-ui-border">
          {displayDescription}
        </div>
      )}

      {visibleParams.length > 0 && (
        <div className="px-3 py-2">
          <div className="text-xs font-semibold text-ui-text-muted uppercase tracking-wide mb-1.5">
            {tCommon('activityDoc.parameters')}
          </div>
          <ul className="space-y-1">
            {visibleParams.slice(0, 6).map((param) => {
              const paramLabel = t(`activities.${activityKey}.params.${param.name}.label`, {
                defaultValue: param.label || param.name,
              });
              const typeColor = PARAM_TYPE_COLORS[param.type] ?? 'bg-ui-surface-muted text-ui-text-muted';
              return (
                <li key={param.name} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-medium ${typeColor}`}
                  >
                    {param.type}
                  </span>
                  <span className="text-ui-text truncate">{paramLabel}</span>
                  {param.required && (
                    <span className="ml-auto flex-shrink-0 text-[10px] text-ui-danger font-medium">
                      req
                    </span>
                  )}
                </li>
              );
            })}
            {visibleParams.length > 6 && (
              <li className="text-xs text-ui-text-subtle">+{visibleParams.length - 6} more...</li>
            )}
          </ul>
        </div>
      )}

      {activity.has_output && activity.output_description && (
        <div className="px-3 py-2 border-t border-ui-border">
          <div className="text-xs font-semibold text-ui-text-muted uppercase tracking-wide mb-0.5">
            {tCommon('activityDoc.output')}
          </div>
          <div className="text-ui-text leading-snug">{activity.output_description}</div>
        </div>
      )}
    </div>,
    document.body
  );
};

export const ActivityDocTooltip: React.FC<ActivityDocTooltipProps> = ({ activity, children }) => {
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const tooltipWidth = 288; // w-72
      const spaceRight = window.innerWidth - rect.right;
      const left = spaceRight >= tooltipWidth + 8 ? rect.right + 8 : rect.left - tooltipWidth - 8;
      const estimatedHeight = 320;
      const spaceBelow = window.innerHeight - rect.top;
      const top = spaceBelow >= estimatedHeight ? rect.top : Math.max(rect.top - estimatedHeight + rect.height, 4);
      setPos({ top, left });
    }, 400);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPos(null);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

   return (
    <div 
      ref={containerRef} 
      onMouseEnter={show} 
      onMouseLeave={hide} 
      onFocus={show} 
      onBlur={hide} 
      className="contents"
      {...(pos ? { 'aria-describedby': tooltipId } : {})}
    >
      {children}
      {pos && <TooltipContent activity={activity} pos={pos} tooltipId={tooltipId} />}
    </div>
  );
};
