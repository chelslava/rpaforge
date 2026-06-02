import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('errors');
  const isDev = process.env.NODE_ENV !== 'production';

  const err = error as Error | null;

  console.error('[ErrorBoundary] Caught error:', err);

  if (isDev && err) {
    logger.error('Caught an error', err);
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900 flex items-center justify-center p-4"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-12 h-12 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {t('errors.somethingWentWrong')}
            </h1>
            <p className="text-gray-600 mb-4">
              {t('errors.somethingWentWrongDesc')}
            </p>

            {isDev && err && (
              <div className="bg-gray-100 rounded p-4 mb-4 overflow-auto max-h-48">
                <p className="font-mono text-sm text-red-600 mb-2">
                  {err.name}: {err.message}
                </p>
                {err.stack && (
                  <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap">
                    {err.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={resetErrorBoundary}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                {t('errors.tryAgain')}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                {t('errors.reloadPage')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBoundaryComponent({ children, fallback }: ErrorBoundaryProps): ReactNode {
  if (fallback) {
    return fallback;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundaryComponent;
