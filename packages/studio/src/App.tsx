import React from 'react';
import { Toaster } from 'sonner';

import Layout from './components/Common/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { useThemeController } from './hooks/useTheme';

const App: React.FC = () => {
  const resolvedTheme = useThemeController();

  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme} />
      <Layout />
    </ErrorBoundary>
  );
};

export default App;
