import React from 'react';

import Layout from './components/Common/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  );
};

export default App;
