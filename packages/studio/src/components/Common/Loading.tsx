import React from 'react';
import { useTranslation } from 'react-i18next';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number;
}

export function LoadingOverlay({
  isVisible,
  message,
  progress,
}: LoadingOverlayProps) {
  const { t } = useTranslation('common');

  if (!isVisible) return null;

  const hasProgress = typeof progress === 'number' && progress >= 0;
  const clampedProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : 0;

  const defaultMessage = t('dialogs.loading');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="alert"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center gap-3 min-w-[240px]">
        <Spinner size="lg" className="text-indigo-600" />
        <p className="text-slate-700 dark:text-slate-200 text-sm text-center">
          {message || defaultMessage}
        </p>
        {hasProgress && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>{t('dialogs.progress')}</span>
              <span>{clampedProgress}%</span>
            </div>
            <div
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={clampedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface InlineLoadingProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingText?: string;
}

export function InlineLoading({ isLoading, children, loadingText }: InlineLoadingProps) {
  const { t } = useTranslation('common');

  if (!isLoading) return <>{children}</>;

  const displayText = loadingText || t('inlineLoading.loading');

  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" />
      {displayText && <span>{displayText}</span>}
    </span>
  );
}
