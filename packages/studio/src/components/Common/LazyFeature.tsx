import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

interface LazyFeatureProps {
  children: ReactNode;
}

function LazyFeatureFallback({ resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common');

  return (
    <div
      className="flex items-center justify-center gap-3 p-4 text-sm text-ui-text-muted"
      role="alert"
      aria-live="assertive"
    >
      <span>{t('lazyFeature.error')}</span>
      <button
        type="button"
        className="rounded bg-ui-primary px-3 py-1.5 text-ui-text-inverse hover:bg-ui-primary-hover"
        onClick={resetErrorBoundary}
      >
        {t('lazyFeature.retry')}
      </button>
    </div>
  );
}

export function LazyFeatureLoading() {
  const { t } = useTranslation('common');

  return (
    <div
      className="flex min-h-16 items-center justify-center p-4 text-sm text-ui-text-muted"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {t('lazyFeature.loading')}
    </div>
  );
}

export function LazyFeature({ children }: LazyFeatureProps) {
  return (
    <ErrorBoundary FallbackComponent={LazyFeatureFallback}>
      <Suspense fallback={<LazyFeatureLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
