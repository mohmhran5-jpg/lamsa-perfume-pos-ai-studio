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