import React, { useEffect, useRef } from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: string;
  pulse?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className = '', color, pulse = false }: SpinnerProps) {
  const spinnerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const spinner = spinnerRef.current;
    if (!spinner) return;

    let frameId = 0;
    const rotateDurationMs = 1000;
    const pulseDurationMs = 1200;

    const animate = (timestamp: number) => {
      const rotation = ((timestamp % rotateDurationMs) / rotateDurationMs) * 360;
      const pulsePhase = Math.sin((timestamp / pulseDurationMs) * Math.PI * 2);
      const scale = pulse ? 1 + pulsePhase * 0.06 : 1;

      spinner.style.transform = `rotate(${rotation}deg) scale(${scale})`;
      spinner.style.opacity = pulse ? `${0.85 + ((pulsePhase + 1) / 2) * 0.15}` : '';
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      spinner.style.transform = '';
      spinner.style.opacity = '';
    };
  }, [pulse]);

  return (
    <svg
      ref={spinnerRef}
      className={`${sizeClasses[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{
        ...(color ? { color } : {}),
        transformOrigin: 'center',
        willChange: 'transform',
      }}
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

export function LoadingOverlay({ isVisible, message = 'Loading...', progress }: LoadingOverlayProps) {
  if (!isVisible) return null;

  const hasProgress = typeof progress === 'number' && progress >= 0;
  const clampedProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="alert"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-xl flex flex-col items-center gap-3 min-w-[240px]">
        <Spinner size="lg" className="text-indigo-600" />
        <p className="text-slate-700 dark:text-slate-200 text-sm text-center">{message}</p>
        {hasProgress && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Progress</span>
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
  if (!isLoading) return <>{children}</>;

  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" />
      {loadingText && <span>{loadingText}</span>}
    </span>
  );
}
