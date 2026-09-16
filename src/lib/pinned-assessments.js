import { base44 } from "@/api/base44Client";

// Assessments a user has pinned to the top of the sidebar.
//
// Recent answers "what was I just in"; pinned answers "what am I running".
// A consultant with two live engagements wants both one click away all week,
// including on the days they open neither, which is exactly when Recent lets
// them fall off.
//
// Stored on the user (User.pinned_assessment_ids) rather than in the browser,
// unlike Recent: a pin is a deliberate choice, and making it again on a second
// device is the kind of thing that makes a feature feel broken.

export const readPinned = (user) =>
  Array.isArray(user?.pinned_assessment_ids) ? user.pinned_assessment_ids : [];

// Pinned order is the order they were pinned in, newest last, so the list does
// not reshuffle under someone's cursor when they pin another.
//
// Ids that no longer resolve — a deleted assessment, or one whose access was
// withdrawn — are dropped on the next write rather than kept forever. They are
// never shown in the meantime, because pinnedIn only returns live rows.
export const togglePinned = (ids, assessmentId, assessments) => {
  const live = new Set(assessments.map(a => a.id));
  const kept = ids.filter(id => live.has(id));
  const next = kept.includes(assessmentId)
    ? kept.filter(id => id !== assessmentId)
    : [...kept, assessmentId];
  // Returned before the write lands, so the pin moves on click. A failed write
  // only means the change is gone on the next load.
  base44.auth.updateMe({ pinned_assessment_ids: next })
    .catch(e => console.error("Could not save pinned assessments", e));
  return next;
};

export const pinnedIn = (ids, assessments) => {
  const byId = new Map(assessments.map(a => [a.id, a]));
  return ids.map(id => byId.get(id)).filter(Boolean);
};
