import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Prevent any annoying camera or audio device permission dialogs from popping up
if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
  try {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Camera prompt suppressed by user preference', 'NotAllowedError'));
  } catch {
    // Read-only property in certain WebViews
  }
}

// Clean up any stale development service workers that could attempt HMR communication
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        if (reg.active?.scriptURL?.includes('dev-sw')) {
          reg.unregister().catch(() => {});
        }
      }
    }).catch(() => {});
  } catch {
    // Ignore in unsupported environments
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);