import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext';

// Suppress WebGL context creation errors from THREE.js
const originalConsoleError = console.error;
console.error = (...args) => {
  const arg = args[0];
  const msg = typeof arg === 'string' ? arg : (arg instanceof Error ? arg.message : '');
  
  if (
    msg.includes('THREE.WebGLRenderer') ||
    msg.includes('WebGL context') ||
    msg.includes('WebGL2 context') ||
    msg.includes('Error creating WebGL context')
  ) {
    return; // Suppress
  }
  
  originalConsoleError.apply(console, args);
};

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Clean up any old service workers (e.g., from previous Next.js deployments)
// to prevent MIME type errors when the browser tries to update them.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((boolean) => {
        if (boolean) {
          console.log('Unregistered old service worker:', registration.scope);
        }
      });
    }
  }).catch((error) => {
    console.error('Failed to unregister service worker:', error);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
