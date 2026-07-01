import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PanelErrorBoundary');

interface PanelErrorBoundaryProps {
  children: ReactNode;
  panelName?: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { panelName } = this.props;
    const panelId = panelName || 'UnknownPanel';

    logger.error(`Panel error in ${panelId}`, {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { children } = this.props;
    const { hasError, error } = this.state;

    if (hasError) {
      const { t } = useTranslation('errors');

      return (
        <div className="h-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-md w-full">
            <div className="flex items-center gap-3 mb-3">
              <svg
                className="w-6 h-6 text-orange-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('panelError.title', 'Panel Error')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {error?.message || t('panelError.defaultMessage', 'An unexpected error occurred.')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={this.handleRetry}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                {t('panelError.retry', 'Retry')}
              </button>
              <button
                onClick={this.handleReload}
                className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t('panelError.reload', 'Reload')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default PanelErrorBoundary;
