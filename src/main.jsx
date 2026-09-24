import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Pages load as separate chunks (see App.jsx), and a publish replaces them with
// newly hashed ones. A tab opened before the publish still asks for the old
// names, and when it moves to a page it has not loaded yet the request fails and
// the screen goes blank. A reload fetches the current index and the current
// chunks. The token pages survive one, since they already recover their token
// from this tab's storage after clearing it from the address.
//
// Once per minute at most, so a chunk that is really missing shows the error
// instead of reloading forever. If storage is unavailable the guard can't be
// kept, so it does not reload at all.
const RELOADED_AT = 'qa_chunk_reload_at';
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
