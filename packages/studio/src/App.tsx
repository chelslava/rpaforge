import React, { useEffect } from 'react';
import { Toaster, toast } from 'sonner';

import Layout from './components/Common/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { SplashScreen } from './components/Common/SplashScreen';
import { useThemeController } from './hooks/useTheme';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useTranslation } from 'react-i18next';

const App: React.FC = () => {
  const resolvedTheme = useThemeController();
  const { t } = useTranslation('common');
  const { isInitializing, progress, currentStep, degraded } = useAppInitialization();

  useEffect(() => {
    if (degraded) {
      toast.warning(t('splash.degraded', 'Starting in degraded mode; some features may be unavailable.'));
    }
  }, [degraded, t]);

  return (
    <ErrorBoundary>
      <SplashScreen
        isVisible={isInitializing}
        progress={progress}
        message={degraded
          ? t('splash.degraded', 'Starting in degraded mode; some features may be unavailable.')
          : t(`splash.steps.${currentStep}`, `Loading ${currentStep}...`)}
        degraded={degraded}
      />
      <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      <Layout />
    </ErrorBoundary>
  );
};

export default App;
