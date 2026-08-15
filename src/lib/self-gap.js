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
    // "a workshop", not "the workshop": this page is shown to everyone who
    // answers, and plenty of them have had no workshop scheduled or even
    // mentioned. The definite article promises a session that may not exist.
    hint: "You rated these important and said execution is falling well short. These are what you'd bring to a workshop.",
    accent: "border-l-[#E02424]",
    heading: "text-[#E02424]",
    fill: "bg-[#E02424]",
  },
  watch: {
    label: "Worth discussing",
    hint: "A real gap, but a smaller one. Whether these matter depends on what the rest of the team said.",
    accent: "border-l-[#E8B339]",
    heading: "text-[#B45309]",
    fill: "bg-[#E8B339]",
  },
  keeping: {
    label: "Keeping pace",
    hint: "Important work you think is being done well. Worth protecting, and worth saying out loud in a room that will mostly discuss problems.",
    accent: "border-l-[#05966A]",
    heading: "text-[#05966A]",
    fill: "bg-[#05966A]",
  },
  low: {
    label: "Not a priority for you",
    hint: "You said this matters little. Shown because a low rating is an opinion the team should see, not an omission.",
    accent: "border-l-gray-300",
    heading: "text-gray-500",
    fill: "bg-gray-300",
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

// ── The shape of the answers, whole and by phase ───────────────────────────
//
// Counts only, off the same buckets the lists below are built from. Nothing new
// is computed here: a summary that could disagree with the sections it
// summarises would be worse than no summary.
//
// The one addition is `unrated`, and it is not optional. A row is bucketed only
// when both importance and execution have a score, so a bar drawn from buckets
// alone quietly loses every "I don't know" and every skipped question — and the
// per-phase totals would then disagree with the count of activities in that
// phase in the appendix, which is exactly the kind of arithmetic a reader does
// check. Kept in, every row is accounted for and every total is verifiable.
//
// It deliberately does not separate "I don't know" from "never answered", even
// though computeSelfGapProfile is careful to. On this bar they are one fact —
// no judgement recorded here — and the distinction between a sightline and an
// omission is made properly in the callout below, where there is room to make
// it in words.
export const UNRATED = {
  key: "unrated",
  label: "You didn't rate these",
  // Outlined rather than filled, so an unrated band reads as an empty slot
  // rather than a fifth verdict.
  fill: "bg-white border border-gray-300",
};

export function computeSelfGapMix(profile) {
  const keys = Object.keys(SELF_BUCKETS);

  const countFor = (rows) => {
    const counts = Object.fromEntries(keys.map(k => [k, 0]));
    let unrated = 0;
    for (const row of rows) {
      if (row.bucket) counts[row.bucket] += 1;
      else unrated += 1;
    }
    const segments = keys.map(key => ({ key, count: counts[key] })).filter(s => s.count > 0);
    if (unrated > 0) segments.push({ key: UNRATED.key, count: unrated });
    return segments;
  };

  // Phase order and membership come from the profile's own facet list, so this
  // can never show a phase that Part two doesn't, or show them in another order.
  const byFacet = profile.facets.map(f => ({
    facet: f.facet,
    count: f.count,
    segments: countFor(profile.rows.filter(r => r.activity.facet === f.facet)),
  }));

  const total = profile.rows.length;

  return {
    total,
    overall: countFor(profile.rows).map(s => ({ ...s, share: total === 0 ? 0 : s.count / total })),
    byFacet,
    facetMax: byFacet.reduce((m, f) => Math.max(m, f.count), 0),
  };
}

// Bar order is declaration order, which is also the order the sections appear
// in below — so the bar reads top to bottom as the page does.
export const MIX_SEGMENTS = { ...SELF_BUCKETS, [UNRATED.key]: UNRATED };
