import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ActivityLogger } from '@/utils/activityLogger'

window.onerror = (message, source, lineno, colno, error) => {
  ActivityLogger.log('error', {
    message,
    source,
    lineno,
    stack: error?.stack?.slice(0, 300)
  });
};

window.addEventListener('unhandledrejection', (event) => {
  ActivityLogger.log('error', {
    message: event.reason?.message || String(event.reason),
    type: 'unhandled_promise'
  });
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)