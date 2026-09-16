import { base44 } from "@/api/base44Client";

// "New responses" on the Assessments page, in the sense a messaging app means
// unread: completions this user has not seen yet.
//
// Per assessment rather than "since you last logged in". A session here lasts
// for weeks, so login is a moment nobody remembers — and a single global
// timestamp would clear every badge the moment the page loaded, which is
// exactly when you wanted to read them. Opening an assessment's Results is the
// act of reading, so that is what marks it seen.
//
// Stored on the user (User.responses_seen_at) rather than in the browser, so a
// consultant who checks results on a laptop does not see the same badges again
// on their phone.

export const loadRespondentSummary = async () => {
  const res = await base44.functions.invoke("summarizeRespondents", {});
  return res?.data?.summary || {};
};

// A user who has never had the field gets a baseline of now, written straight
// back. Without it every completion ever recorded would arrive as unread on
// the first load, which reads as a flood rather than news.
export const ensureSeenState = async (user) => {
  const stored = user?.responses_seen_at;
  if (stored?.since) return { since: stored.since, assessments: stored.assessments || {} };
  const fresh = { since: new Date().toISOString(), assessments: {} };
  try {
    await base44.auth.updateMe({ responses_seen_at: fresh });
  } catch (e) {
    // Not fatal: badges stay at zero this session and the baseline is retried
    // on the next load.
    console.error("Could not record responses baseline", e);
  }
  return fresh;
};

export const unreadCount = (summaryRow, seen, assessmentId) => {
  if (!summaryRow || !seen) return 0;
  const cutoff = seen.assessments?.[assessmentId] || seen.since;
  return summaryRow.completed_dates.filter(d => d > cutoff).length;
};

// Returns the new state immediately so the badge clears on click; the write
// follows. A failed write only means the badge comes back on the next load.
export const markSeen = (seen, assessmentId) => {
  const next = {
    ...seen,
    assessments: { ...seen.assessments, [assessmentId]: new Date().toISOString() },
  };
  base44.auth.updateMe({ responses_seen_at: next })
    .catch(e => console.error("Could not mark responses seen", e));
  return next;
};

// Recently opened assessments, most recent first. Per browser and per user on
// purpose: "what was I just in" is a question about this device's session, and
// unlike the badges nothing is lost if it differs on another machine.
const RECENT_LIMIT = 5;
const recentKey = (userId) => `qa_admin_recent_${userId}`;

export const readRecent = (userId) => {
  try {
    const ids = JSON.parse(localStorage.getItem(recentKey(userId)) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
};

export const pushRecent = (userId, assessmentId) => {
  const next = [assessmentId, ...readRecent(userId).filter(id => id !== assessmentId)].slice(0, RECENT_LIMIT * 2);
  try {
    localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    // Private windows can refuse storage; the in-memory list still works.
  }
  return next;
};

// Stored a few beyond the limit so a deleted or unshared assessment dropping
// out of view does not leave the list one short.
export const visibleRecent = (ids, assessments) => {
  const byId = new Map(assessments.map(a => [a.id, a]));
  return ids.map(id => byId.get(id)).filter(Boolean).slice(0, RECENT_LIMIT);
};

// "2 hours ago", "Yesterday", "Sep 2". Coarse on purpose: a list is sorted by
// it, not audited by it.
export const relativeDate = (iso) => {
  if (!iso) return "—";
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    month: "short", day: "numeric",
    ...(then.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
};
