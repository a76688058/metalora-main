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

// Unregister any existing service workers to clear cached 403 errors
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    }
  }).catch(function(err) {
    console.log('Service Worker registration failed: ', err);
  });
  
  // Clear any existing caches
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
