import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { configureAmplify } from './lib/aws-api-client';
import { installStaleBuildRecovery, markBuildHealthy } from './lib/stale-build';

// Must run before anything dynamically imports a chunk, so a cached
// index.html from a previous deploy recovers itself instead of erroring.
installStaleBuildRecovery();

configureAmplify().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  markBuildHealthy();
});
