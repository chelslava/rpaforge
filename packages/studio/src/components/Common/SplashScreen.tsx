import { useTranslation } from 'react-i18next';
import { Spinner } from './Loading';

export interface SplashScreenProps {
  isVisible: boolean;
  progress?: number;
  message?: string;
  degraded?: boolean;
}

export function SplashScreen({ isVisible, progress = 0, message, degraded = false }: SplashScreenProps) {
  const { t } = useTranslation('common');

  if (!isVisible) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress));
  const displayMessage = message || t('splash.initializing', 'Initializing RPAForge...');

  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-indigo-600 to-indigo-800 flex flex-col items-center justify-center z-[100000]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">RPAForge</h1>
        </div>

        {/* Loading Spinner and Message */}
        <div className="flex flex-col items-center gap-4 w-72">
          <Spinner size="lg" className="text-white" />
          <p className={`text-center text-sm font-medium ${degraded ? 'text-amber-200' : 'text-white/90'}`}>
            {displayMessage}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-72">
          <div className="flex justify-between text-xs text-white/70 mb-2">
            <span>{t('splash.loading', 'Loading')}</span>
            <span className="font-semibold">{clampedProgress}%</span>
          </div>
          <div
            className="w-full h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm"
            role="progressbar"
            aria-valuenow={clampedProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('splash.progress', 'Loading progress')}
          >
            <div
              className="h-full bg-white rounded-full shadow-lg transition-all duration-300 ease-out"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>

        {/* Version Info */}
        <p className="text-white/60 text-xs mt-4">v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}

export default SplashScreen;
