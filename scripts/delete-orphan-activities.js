// One-off cleanup for orphaned custom activities.
//
// A custom Activity carries an `assessment_id` and belongs to that one
// assessment. Until the August 2026 fix, deleteAssessment left those rows
// behind, so every assessment ever deleted leaked its custom activities. They
// are invisible from the app — the library list shows only rows with no
// assessment_id, and everything else reaches activities *through* an assessment
// that no longer exists — so nothing surfaces or clears them.
//
// HOW TO RUN
//   1. Open the app and sign in as a super admin.
//   2. Open the browser console (⌥⌘J in Chrome).
//   3. Paste this whole file and press Return.
//
// It runs against whatever origin the page is on, using the session token the
// app already stores, so it needs no keys and inherits your own permissions.
//
// It re-derives which activities are orphans every run rather than trusting a
// hardcoded list: each candidate's parent assessment is fetched, and the row is
// deleted only on a definite 404. Anything else — a network blip, a permission
// error, a 500 — is treated as "not proven orphaned" and skipped. That is what
// makes it safe to run again later, when real assessments exist again.

(async () => {
  const appId = localStorage.getItem("base44_app_id");
  // The SDK writes both keys on sign-in; "token" is the platform v2 alias and is
  // read as a fallback in case only that one is present.
  const token = localStorage.getItem("base44_access_token") || localStorage.getItem("token");
  if (!appId || !token) {
    console.error("Not signed in on this origin — no app id or access token in localStorage.");
    return;
  }

  const api = (path, init = {}) =>
    fetch(`/api/apps/${appId}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });

  // Every activity that names an assessment. 500 is the API's max page size and
  // is far above the number of custom activities this app will ever hold; the
  // guard below catches it if that ever stops being true.
  const res = await api(`entities/Activity?q=${encodeURIComponent(JSON.stringify({ assessment_id: { $ne: null } }))}&limit=500`);
  if (!res.ok) {
    console.error("Could not list activities:", res.status, await res.text());
    return;
  }
  const custom = await res.json();
  if (custom.length === 500) {
    console.warn("Hit the 500-row page limit — re-run after this pass to catch the rest.");
  }
  if (custom.length === 0) {
    console.log("No custom activities at all. Nothing to do.");
    return;
  }

  // Cache per assessment id: several activities usually share a parent.
  const parentExists = new Map();
  const checkParent = async (id) => {
    if (parentExists.has(id)) return parentExists.get(id);
    const r = await api(`entities/Assessment/${id}`);
    let verdict;
    if (r.status === 404) verdict = false;
    else if (r.ok) verdict = true;
    else verdict = null; // unknown — refuse to delete on an ambiguous answer
    parentExists.set(id, verdict);
    return verdict;
  };

  const orphans = [];
  const kept = [];
  const unknown = [];
  for (const a of custom) {
    const exists = await checkParent(a.assessment_id);
    if (exists === false) orphans.push(a);
    else if (exists === true) kept.push(a);
    else unknown.push(a);
  }

  console.log(`${custom.length} custom activities: ${orphans.length} orphaned, ${kept.length} still owned, ${unknown.length} undetermined.`);
  if (kept.length > 0) console.log("Keeping (parent assessment still exists):", kept.map(a => a.name));
  if (unknown.length > 0) console.warn("Skipping (could not confirm parent):", unknown.map(a => a.name));
  if (orphans.length === 0) {
    console.log("No orphans to delete.");
    return;
  }

  console.log("Deleting:", orphans.map(a => `${a.facet} · ${a.name}`));
  let deleted = 0;
  for (const a of orphans) {
    const r = await api(`entities/Activity/${a.id}`, { method: "DELETE" });
    if (r.ok) { deleted++; }
    else console.error(`Failed to delete ${a.name} (${a.id}):`, r.status, await r.text());
  }
  console.log(`Done — deleted ${deleted} of ${orphans.length}.`);
})();
