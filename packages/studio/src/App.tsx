import React from 'react';
import { Toaster } from 'sonner';

import Layout from './components/Common/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Toaster position="bottom-right" richColors closeButton />
      <Layout />
    </ErrorBoundary>
  );
};

export default App;
