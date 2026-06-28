const SESSION_KEY = 'qa_activity_log';
const MAX_ENTRIES = 200;

export const ActivityLogger = {
  log(type, data) {
    const entry = {
      ts: new Date().toISOString(),
      type,        // 'nav' | 'action' | 'error' | 'api'
      ...data
    };

    const existing = this.getLog();
    existing.push(entry);

    // Keep only the last MAX_ENTRIES to avoid blowing up sessionStorage
    if (existing.length > MAX_ENTRIES) existing.shift();

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(existing));
    console.debug('[QA]', entry); // visible in DevTools
  },

  getLog() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
    } catch {
      return [];
    }
  },

  clear() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  // Call this to get a shareable summary (Barb emails you the output)
  export() {
    const log = this.getLog();
    const summary = JSON.stringify(log, null, 2);
    console.log('=== ACTIVITY LOG ===\n', summary);
    return summary;
  }
};