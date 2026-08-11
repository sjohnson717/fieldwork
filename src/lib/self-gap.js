import { IMPORTANCE_SCORE, EXECUTION_SCORE, avg } from "@/lib/scoring";

// One respondent's own gap analysis, for the summary they see after submitting.
//
// This is deliberately not computeActivityStats with a single response fed into
// it. That function answers "what does the team think", and every field it
// returns — averages, top owner, owner agreement — is a claim about a group. One
// person's answers are not a small sample of their team; they are one opinion,
// and the summary has to read as one. So the numbers here stay the person's own
// labels wherever possible, and the only averaging is per facet, where there is
// genuinely more than one activity to combine.

export const SELF_BUCKETS = {
  critical: {
    label: "Immediate attention",
    hint: "You rated these important and said execution is falling well short. These are what you'd bring to the workshop.",
    accent: "border-l-[#E02424]",
    heading: "text-[#E02424]",
  },
  watch: {
    label: "Worth discussing",
    hint: "A real gap, but a smaller one. Whether these matter depends on what the rest of the team said.",
    accent: "border-l-[#E8B339]",
    heading: "text-[#B45309]",
  },
  keeping: {
    label: "Keeping pace",
    hint: "Important work you think is being done well. Worth protecting, and worth saying out loud in a room that will mostly discuss problems.",
    accent: "border-l-[#05966A]",
    heading: "text-[#05966A]",
  },
  low: {
    label: "Not a priority for you",
    hint: "You said this matters little. Shown because a low rating is an opinion the team should see, not an omission.",
    accent: "border-l-gray-300",
    heading: "text-gray-500",
  },
};

// Matches gapLabel's thresholds in scoring.js, so a respondent's own buckets and
// the facilitator's report never disagree about what counts as a gap.
const bucketFor = (imp, exec) => {
  if (imp === undefined) return null;
  if (exec === undefined) return null; // "I don't know", or unanswered
  const gap = imp - exec;
  if (gap >= 2) return "critical";
  if (gap >= 1) return "watch";
  return imp >= 1.5 ? "keeping" : "low";
};

/**
 * Rows, buckets, per-facet averages, and the activities this person could not
 * rate. `unknowns` is the finding a team average cannot produce: "important, and
 * I can't see how it's going" is information about visibility, and averaging it
 * across a team erases it.
 */
export function computeSelfGapProfile(activities, responses, facetOrder) {
  const byActivity = Object.fromEntries(responses.map(r => [r.activity_id, r]));

  const rows = activities.map(act => {
    const resp = byActivity[act.id] || {};
    const imp = IMPORTANCE_SCORE[resp.importance];
    const exec = EXECUTION_SCORE[resp.execution];
    return {
      activity: act,
      importance: resp.importance || null,
      execution: resp.execution || null,
      suggested_owner: resp.suggested_owner || null,
      imp,
      exec,
      gap: imp !== undefined && exec !== undefined ? imp - exec : null,
      bucket: bucketFor(imp, exec),
    };
  });

  const buckets = Object.fromEntries(Object.keys(SELF_BUCKETS).map(k => [k, []]));
  for (const row of rows) if (row.bucket) buckets[row.bucket].push(row);
  // Widest gap first, then by how much they said it matters — the same order the
  // facilitator's "top improvement opportunities" list uses.
  //
  // Except in the two buckets that aren't gaps. Sorting those by gap puts every
  // "Good" above every "Excellent", because a gap of 0 outranks one of -1 — so
  // the one bucket carrying good news led with its weakest examples and buried
  // Critical · Excellent at the bottom. There, importance leads and execution
  // breaks the tie.
  const byGap = (a, b) => (b.gap - a.gap) || (b.imp - a.imp);
  const byStanding = (a, b) => (b.imp - a.imp) || (b.exec - a.exec);
  for (const key of Object.keys(buckets)) {
    buckets[key].sort(key === "critical" || key === "watch" ? byGap : byStanding);
  }

  const facets = facetOrder
    .filter(f => activities.some(a => a.facet === f))
    .map(facet => {
      const facetRows = rows.filter(r => r.activity.facet === facet);
      return {
        facet,
        count: facetRows.length,
        importance: avg(facetRows.map(r => r.imp).filter(v => v !== undefined)),
        execution: avg(facetRows.map(r => r.exec).filter(v => v !== undefined)),
      };
    });

  // Rated as mattering, but with no view on how well it is being done.
  const unknowns = rows.filter(r => r.imp !== undefined && r.exec === undefined && r.execution);

  return {
    rows,
    buckets,
    facets,
    unknowns,
    answeredCount: rows.filter(r => r.imp !== undefined || r.exec !== undefined).length,
  };
}
