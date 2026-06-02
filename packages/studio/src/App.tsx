import React from 'react';
import { Toaster } from 'sonner';

import Layout from './components/Common/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { SplashScreen } from './components/Common/SplashScreen';
import { useThemeController } from './hooks/useTheme';
import { useAppInitialization } from './hooks/useAppInitialization';

const App: React.FC = () => {
  const resolvedTheme = useThemeController();
  const { isInitializing, progress, currentStep } = useAppInitialization();

  return (
    <ErrorBoundary>
      <SplashScreen
        isVisible={isInitializing}
        progress={progress}
        message={`Loading ${currentStep}...`}
      />
      <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      <Layout />
    </ErrorBoundary>
  );
};

export default App;
