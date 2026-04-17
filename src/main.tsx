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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
