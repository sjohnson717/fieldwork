// Shared scoring constants and helpers used by ReportPage, AssessmentDiscussion,
// and AssessmentResults to turn raw Response records into importance/execution/gap stats.

export const IMPORTANCE_SCORE = { "Not needed": 0, "Nice to have": 1, "Important": 2, "Critical": 3 };
export const EXECUTION_SCORE  = { "Not done": 0, "Inconsistent": 1, "Good": 2, "Excellent": 3 };
export const IMPORTANCE_LABEL = ["Not needed", "Nice to have", "Important", "Critical"];
export const EXECUTION_LABEL  = ["Not done", "Inconsistent", "Good", "Excellent"];

export const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

export const FACET_SUBTITLES = {
  DEFINE: "problems to solve",
  COMMIT: "the resources",
  DESCRIBE: "problems with stories",
  CREATE: "winning solutions",
  PREPARE: "the teams",
  DELIVER: "to market",
};

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
];

export const avg = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);
export const fmt = (n) => (n === null ? "—" : n.toFixed(1));

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
    const gaps = actResps
      .map((r) => {
        const i = IMPORTANCE_SCORE[r.importance];
        const e = EXECUTION_SCORE[r.execution];
        return i !== undefined && e !== undefined ? i - e : null;
      })
      .filter((v) => v !== null);
    const avgGap = avg(gaps);

    const ownerTally = {};
    for (const r of actResps) {
      if (r.suggested_owner) ownerTally[r.suggested_owner] = (ownerTally[r.suggested_owner] || 0) + 1;
    }
    const ownerEntries = Object.entries(ownerTally).sort((a, b) => b[1] - a[1]);
    const topOwner = ownerEntries[0]?.[0] || null;
    const ownerWithSuggestion = actResps.filter((r) => r.suggested_owner).length;
    const ownerAgreement = ownerEntries[0] && ownerWithSuggestion > 0
      ? ownerEntries[0][1] / ownerWithSuggestion
      : null;

    stats[act.id] = { avgImp, avgExec, avgGap, n: actResps.length, topOwner, ownerAgreement, ownerEntries };
  }
  return stats;
}
