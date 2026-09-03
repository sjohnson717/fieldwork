import { NO_OWNER, UNKNOWN_OWNER } from "@/lib/ownership";
// Shared scoring constants and helpers used by ReportPage, AssessmentDiscussion,
// and AssessmentResults to turn raw Response records into importance/execution/gap stats.

export const IMPORTANCE_SCORE = { "Not needed": 0, "Nice to have": 1, "Important": 2, "Critical": 3 };
export const EXECUTION_SCORE  = { "Not done": 0, "Inconsistent": 1, "Good": 2, "Excellent": 3 };
export const IMPORTANCE_LABEL = ["Not needed", "Nice to have", "Important", "Critical"];
export const EXECUTION_LABEL  = ["Not done", "Inconsistent", "Good", "Excellent"];

// Pill styling for a single answer. Shared so a respondent's summary and the
// answer table below it colour the same label the same way — they sit on one
// page, and two treatments of "Inconsistent" read as two different answers.
export const BADGE_FALLBACK = "bg-gray-100 text-gray-600";

export const IMPORTANCE_BADGE = {
  "Not needed":   "bg-gray-100 text-gray-600",
  "Nice to have": "bg-blue-100 text-blue-700",
  "Important":    "bg-blue-500 text-white",
  "Critical":     "bg-blue-800 text-white",
};

export const EXECUTION_BADGE = {
  "Not done":     "bg-rose-100 text-rose-700",
  "Inconsistent": "bg-amber-100 text-amber-800",
  "Good":         "bg-green-100 text-green-700",
  "Excellent":    "bg-green-600 text-white",
};

// The one canonical facet order. Everything that sorts, pages or groups by facet
// imports this — the survey's paging in `Assessment`, the library and activity
// pickers, getAssignedActivities. Keeping a local copy is how LEARN went missing
// from four files at once while staying present in the entity enum.
export const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER", "LEARN"];

export const FACET_SUBTITLES = {
  DEFINE: "problems to solve",
  COMMIT: "the resources",
  DESCRIBE: "problems with stories",
  CREATE: "winning solutions",
  PREPARE: "the teams",
  DELIVER: "to market",
  LEARN: "from outcomes",
};

// Sorts an unknown facet last rather than first. `indexOf` returns -1, not
// undefined, so the obvious `indexOf(f) ?? 99` never fires its fallback and a
// facet missing from FACET_ORDER silently jumps to the head of the list.
export const facetRank = (facet) => {
  const i = FACET_ORDER.indexOf(facet);
  return i === -1 ? FACET_ORDER.length : i;
};

// The three paired themes tell the Plan → Build → Sell story, and each pair's two
// facets are genuinely two halves of one job. LEARN is not half of anything: it
// runs across the whole cycle rather than sitting at a point in it, so it gets a
// standalone single-facet group rendered after the three pairs.
//
// `standalone` suppresses the per-facet sub-header inside the section — with one
// facet the theme header already names it, and repeating "LEARN" twice in two
// type sizes reads as a bug.
export const THEME_GROUPS = [
  {
    label: "Plan the right things",
    facets: ["DEFINE", "COMMIT"],
    color: "#3366FF",
    lightColor: "#EEF2FF",
    textColor: "#1E3A8A",
  },
  {
    label: "Build what you plan",
    facets: ["DESCRIBE", "CREATE"],
    color: "#333333",
    lightColor: "#F3F4F6",
    textColor: "#111827",
  },
  {
    label: "Sell what you build",
    facets: ["PREPARE", "DELIVER"],
    color: "#11CC77",
    lightColor: "#ECFDF5",
    textColor: "#065F46",
  },
  {
    label: "Learn what worked",
    facets: ["LEARN"],
    color: "#8855FF",
    lightColor: "#F5F0FF",
    textColor: "#5B21B6",
    standalone: true,
  },
];

export const avg = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);
// Guards undefined as well as null. It only ever received null before, until a
// second copy of this function grew in personal-scoring.js that also handled
// undefined — a sure sign one of its callers passes it. One definition, the
// defensive one; the alternative is a TypeError on an optional field.
export const fmt = (n) => (n === null || n === undefined ? "—" : n.toFixed(1));

// What a gap is, in one place: importance minus execution for a single
// response, and null unless the respondent answered both sides. The formula
// lived inline in computeActivityStats and again in the results heatmap, which
// is one copy too many for the number the whole product is named after.
export const responseGap = (response) => {
  const i = IMPORTANCE_SCORE[response?.importance];
  const e = EXECUTION_SCORE[response?.execution];
  return i !== undefined && e !== undefined ? i - e : null;
};

export const gapColor = (gap) => {
  if (gap === null) return "#E5E7EB";
  if (gap >= 2) return "#FF3333";
  if (gap >= 1) return "#FFCC00";
  return "#11CC77";
};

export const gapLabel = (gap) => {
  if (gap === null) return "No data";
  if (gap >= 2) return "Immediate attention";
  if (gap >= 1) return "Worth discussing";
  return "Performing well";
};

// ── The shape of a team's answers ──────────────────────────────────────────
//
// The same four states gapLabel names, counted rather than averaged, whole and
// per facet. Nothing new is computed: a summary that could disagree with the
// activity rows it summarises would be worse than no summary.
//
// This is deliberately not what the facet wheel shows. That badges each facet
// by its *average* gap, which is the right shorthand for "how is this phase
// doing" and the wrong one for "how much of it is in trouble" — one severe gap
// among five healthy activities averages away to "performing well". Counting
// keeps the one activity visible as a band you can see.
//
// `nodata` is a band rather than an omission. An activity nobody completed has
// a null gap, and dropping it would leave the per-facet totals disagreeing with
// the number of activities listed under that facet further down the page —
// which is the arithmetic a reader checks first. Drawn as an outline so it
// reads as an unanswered slot rather than a fourth verdict.
export const GAP_BUCKETS = {
  critical: { label: "Immediate attention", fill: "bg-[#FF3333]" },
  attention: { label: "Worth discussing",   fill: "bg-[#FFCC00]" },
  ontrack:   { label: "Performing well",    fill: "bg-[#11CC77]" },
  nodata:    { label: "Not enough answers", fill: "bg-white border border-gray-300" },
};

// Matches gapLabel's thresholds, so the bands and the activity rows can never
// disagree about what counts as a gap.
export const gapBucket = (gap) => {
  if (gap === null || gap === undefined) return "nodata";
  if (gap >= 2) return "critical";
  if (gap >= 1) return "attention";
  return "ontrack";
};

export function computeGapMix(activities, activityStats, facetOrder) {
  const keys = Object.keys(GAP_BUCKETS);

  const countFor = (acts) => {
    const counts = Object.fromEntries(keys.map(k => [k, 0]));
    for (const a of acts) counts[gapBucket(activityStats[a.id]?.avgGap ?? null)] += 1;
    return keys.map(key => ({ key, count: counts[key] })).filter(s => s.count > 0);
  };

  const byFacet = facetOrder
    .map(facet => {
      const acts = activities.filter(a => a.facet === facet);
      if (acts.length === 0) return null;
      return { facet, count: acts.length, segments: countFor(acts) };
    })
    .filter(Boolean);

  const total = activities.length;

  return {
    total,
    // Declaration order, worst first — which is the order the filter chips and
    // the activity list below already use.
    overall: countFor(activities).map(s => ({ ...s, share: total === 0 ? 0 : s.count / total })),
    byFacet,
    facetMax: byFacet.reduce((m, f) => Math.max(m, f.count), 0),
  };
}

// Aggregates a set of Response records per activity into
// { avgImp, avgExec, avgGap, n, topOwner, ownerAgreement, ownerEntries }.
export function computeActivityStats(activities, responses) {
  const stats = {};
  for (const act of activities) {
    const actResps = responses.filter((r) => r.activity_id === act.id);
    const impScores = actResps.map((r) => IMPORTANCE_SCORE[r.importance]).filter((v) => v !== undefined);
    const execScores = actResps.map((r) => EXECUTION_SCORE[r.execution]).filter((v) => v !== undefined);
    const avgImp = avg(impScores);
    const avgExec = avg(execScores);

    // Gap is the average of each response's own (importance - execution) —
    // only responses with both fields answered contribute — rather than the
    // difference of the two independent averages above. The two diverge
    // whenever a respondent answered only one side of a question, since that
    // response would otherwise pull avgImp or avgExec without a matching
    // partner to subtract against.
    const gaps = actResps.map(responseGap).filter((v) => v !== null);
    const avgGap = avg(gaps);

    // "I don't know" is an answer to the ownership question but not a role, so
    // it is counted apart from the tally. Left in, it would sort to the top on
    // any activity where confusion is the majority view and the report would
    // name it as the owner. Kept out of the denominator below it would do the
    // opposite — three people naming a role and five saying they don't know
    // would read as unanimous. It dilutes agreement without ever winning it.
    const ownerTally = {};
    let ownerUnknown = 0;
    let ownerNone = 0;
    for (const r of actResps) {
      if (!r.suggested_owner) continue;
      if (r.suggested_owner === UNKNOWN_OWNER) { ownerUnknown++; continue; }
      if (r.suggested_owner === NO_OWNER) { ownerNone++; continue; }
      ownerTally[r.suggested_owner] = (ownerTally[r.suggested_owner] || 0) + 1;
    }
    const ownerEntries = Object.entries(ownerTally).sort((a, b) => b[1] - a[1]);
    const topOwner = ownerEntries[0]?.[0] || null;
    const ownerWithSuggestion = actResps.filter((r) => r.suggested_owner).length;
    const ownerAgreement = ownerEntries[0] && ownerWithSuggestion > 0
      ? ownerEntries[0][1] / ownerWithSuggestion
      : null;

    stats[act.id] = { avgImp, avgExec, avgGap, n: actResps.length, topOwner, ownerAgreement, ownerEntries, ownerUnknown, ownerNone };
  }
  return stats;
}
