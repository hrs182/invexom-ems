import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './components/print/print.css';
import '@fontsource/inter/400.css';
// Capture early boot errors for headless diagnostics (dev only)
if (typeof window !== 'undefined') {
  (window as unknown as { __errs: string[] }).__errs = [];
  window.addEventListener('error', (e) => {
    (window as unknown as { __errs: string[] }).__errs.push(String(e.message || e.error));
  });
}
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './stores/theme'; // applies persisted theme before first paint

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
