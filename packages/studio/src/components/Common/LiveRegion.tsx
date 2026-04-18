import React from 'react';

export interface LiveRegionProps {
  /** Content to announce to screen readers */
  children: React.ReactNode;
  /** Whether to announce immediately ('assertive') or wait ('polite') */
  mode?: 'polite' | 'assertive';
  /** Whether to announce the entire content or just changes */
  atomic?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether the region is visually hidden */
  visuallyHidden?: boolean;
}

/**
 * A live region component that announces content changes to screen readers.
 * Use this for dynamic content that should be announced to users.
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({
  children,
  mode = 'polite',
  atomic = true,
  className = '',
  visuallyHidden = true,
}) => {
  return (
    <div
      role="status"
      aria-live={mode}
      aria-atomic={atomic}
      className={`${visuallyHidden ? 'sr-only' : ''} ${className}`.trim()}
    >
      {children}
    </div>
  );
};

/**
 * A more assertive live region for important announcements.
 * Use sparingly - only for critical information.
 */
export const AlertRegion: React.FC<Omit<LiveRegionProps, 'mode'>> = ({
  children,
  atomic = true,
  className = '',
  visuallyHidden = true,
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic={atomic}
      className={`${visuallyHidden ? 'sr-only' : ''} ${className}`.trim()}
    >
      {children}
    </div>
  );
};

export default LiveRegion;
