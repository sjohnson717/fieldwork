import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";

// ── PGL brand ────────────────────────────────────────────────────────────────
const PGL_LOGO = "https://static.wixstatic.com/media/739bca_d49790dff653441fae7d036110019dc2~mv2.png";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

const THEME_GROUPS = [
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

const FACET_SUBTITLES = {
  DEFINE: "problems to solve",
  COMMIT: "the resources",
  DESCRIBE: "problems with stories",
  CREATE: "winning solutions",
  PREPARE: "the teams",
  DELIVER: "to market",
};

const IMPORTANCE_SCORE = { "Not needed": 0, "Nice to have": 1, "Important": 2, "Critical": 3 };
const EXECUTION_SCORE  = { "Not done": 0, "Inconsistent": 1, "Good": 2, "Excellent": 3 };
const IMPORTANCE_LABEL = ["Not needed", "Nice to have", "Important", "Critical"];
const EXECUTION_LABEL  = ["Not done", "Inconsistent", "Good", "Excellent"];

const avg = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
const fmt = (n) => n === null ? "—" : n.toFixed(1);

const gapColor = (gap) => {
  if (gap === null) return "#E5E7EB";
  if (gap >= 2)   return "#FF3333";
  if (gap >= 1)   return "#FFCC00";
  return "#11CC77";
};

const gapLabel = (gap) => {
  if (gap === null) return "No data";
  if (gap >= 2)   return "Critical gap";
  if (gap >= 1)   return "Needs attention";
  return "On track";
};

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ value, label, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 text-center">
      <div className="text-3xl font-bold mb-1" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

function GapBar({ importance, execution, gap, maxWidth = 200 }) {
  const impPct  = importance !== null ? (importance / 3) * 100 : 0;
  const execPct = execution  !== null ? (execution  / 3) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Importance</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#3366FF] transition-all" style={{ width: `${impPct}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">{IMPORTANCE_LABEL[Math.round(importance)] || "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Execution</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#11CC77] transition-all" style={{ width: `${execPct}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">{EXECUTION_LABEL[Math.round(execution)] || "—"}</span>
      </div>
    </div>
  );
}

function ActivityRow({ activity, stats, themeColor }) {
  const [expanded, setExpanded] = useState(false);
  const gap = stats?.avgGap ?? null;
  const dot = gapColor(gap);

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors text-left"
      >
        {/* Gap dot */}
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800">{activity.name}</span>
          {activity.description && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{activity.description}</p>
          )}
        </div>

        {/* Gap badge + ownership badge */}
        <div className="shrink-0 flex items-center gap-3">
          {stats?.ownerEntries?.length > 0 && (() => {
            const ownerBadge =
              stats.ownerAgreement < 0.5 ? "Owner unclear" :
              (activity.preferred_owner && stats.topOwner !== activity.preferred_owner) ? "Owner mismatch" :
              null;
            return ownerBadge ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#6D28D9]">
                {ownerBadge}
              </span>
            ) : null;
          })()}
          {gap !== null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: dot + "22", color: gap >= 2 ? "#991B1B" : gap >= 1 ? "#92700A" : gap !== null ? "#065F46" : "#6B7280" }}>
              {gapLabel(gap)}
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && stats && (
        <div className="px-5 pb-4 space-y-4">
          <GapBar importance={stats.avgImp} execution={stats.avgExec} gap={gap} />
          {(stats.ownerEntries?.length > 0 || activity.preferred_owner) && (
            <div className="space-y-1">
              {stats.ownerEntries?.length > 0 && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">Proposed owner: </span>
                  {stats.ownerEntries.map(([name, count], i) => (
                    <span key={name}>
                      {i > 0 && <span className="text-gray-300 mx-1">·</span>}
                      <span className="text-gray-700">{name}</span>
                      <span className="text-gray-400 ml-0.5">({count})</span>
                    </span>
                  ))}
                  {stats.ownerAgreement < 0.6 && (
                    <span className="ml-2 text-amber-600 font-medium">⚠ ownership unclear</span>
                  )}
                </div>
              )}
              {activity.preferred_owner && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">Recommended owner: </span>
                  <span className="text-gray-700">{activity.preferred_owner}</span>
                </div>
              )}
            </div>
          )}
          {stats.n > 0 && (
            <div className="text-xs text-gray-400">{stats.n} response{stats.n !== 1 ? "s" : ""}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ThemeSection({ group, activities, activityStats, filterLevel, facetFilter }) {
  const groupActivities = activities.filter(a => group.facets.includes(a.facet));
  if (groupActivities.length === 0) return null;

  // Filter based on selected level
  let visibleActivities = groupActivities.filter(a => {
    if (facetFilter && a.facet !== facetFilter) return false;
    const gap = activityStats[a.id]?.avgGap ?? null;
    if (filterLevel === "all") return true;
    if (filterLevel === "critical") return gap !== null && gap >= 2;
    if (filterLevel === "attention") return gap !== null && gap >= 1 && gap < 2;
    if (filterLevel === "ontrack") return gap !== null && gap < 1;
    // "problems" = default: critical + attention
    return gap === null || gap >= 1;
  });

  // If nothing to show in this theme
  if (visibleActivities.length === 0) {
    // In problems view: show a positive "all on track" message — it's genuinely meaningful
    if (filterLevel === "problems") {
      return (
        <section className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{group.label}</h2>
              <p className="text-xs text-gray-400">{group.facets.join(" · ")}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-sm text-[#11CC77] font-medium flex items-center gap-2">
              <span>✓</span> All activities on track in this area
            </p>
          </div>
        </section>
      );
    }
    // For specific filters (critical, attention, ontrack, all): just hide the theme
    return null;
  }

  // Group by facet within the theme
  const byFacet = group.facets.map(f => ({
    facet: f,
    subtitle: FACET_SUBTITLES[f],
    items: visibleActivities.filter(a => a.facet === f),
  })).filter(f => f.items.length > 0);

  // Theme-level gap average
  const themeGaps = groupActivities
    .map(a => activityStats[a.id]?.avgGap)
    .filter(v => v !== null && v !== undefined);
  const themeAvgGap = avg(themeGaps);

  const criticalCount = groupActivities.filter(a => (activityStats[a.id]?.avgGap ?? 0) >= 2).length;
  const attentionCount = groupActivities.filter(a => {
    const g = activityStats[a.id]?.avgGap ?? 0;
    return g >= 1 && g < 2;
  }).length;

  return (
    <section className="mb-10">
      {/* Theme header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <div>
          <h2 className="text-lg font-bold text-gray-900">{group.label}</h2>
          <p className="text-xs text-gray-400">
            {group.facets.join(" · ")}
            {themeAvgGap !== null && (
              <span className="ml-3 font-semibold" style={{ color: gapColor(themeAvgGap) }}>
                avg gap {fmt(themeAvgGap)}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="ml-2 text-[#FF3333] font-medium">{criticalCount} critical</span>
            )}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {byFacet.map(({ facet, subtitle, items }) => (
          <div key={facet}>
            {/* Facet sub-header */}
            <div id={facet} className="px-5 py-2.5 border-b border-gray-50"
              style={{ backgroundColor: group.lightColor }}>
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: group.color }}>
                {facet}
              </span>
              <span className="text-xs text-gray-400 ml-2">{subtitle}</span>
            </div>
            {items.map(act => (
              <ActivityRow
                key={act.id}
                activity={act}
                stats={activityStats[act.id]}
                themeColor={group.color}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function FacetWheel({ activityStats, activities, onFacetClick }) {
  const statusLabel = (gap) => {
    if (gap === null) return { label: "No data", color: "#9CA3AF", bg: "#F3F4F6" };
    if (gap >= 2)     return { label: "At Risk",  color: "#FF3333", bg: "#FFF1F1" };
    if (gap >= 1)     return { label: "Watch",    color: "#D97706", bg: "#FFFBEB" };
    return              { label: "Strong",   color: "#11CC77", bg: "#ECFDF5" };
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {THEME_GROUPS.map(group => (
        group.facets.map(facet => {
          const facetActs = activities.filter(a => a.facet === facet);
          const gaps = facetActs
            .map(a => activityStats[a.id]?.avgGap)
            .filter(v => v !== null && v !== undefined);
          const avgGap = avg(gaps);
          const { label, color, bg } = statusLabel(avgGap);
          const critCount = facetActs.filter(a => (activityStats[a.id]?.avgGap ?? 0) >= 2).length;
          const watchCount = facetActs.filter(a => {
            const g = activityStats[a.id]?.avgGap ?? 0;
            return g >= 1 && g < 2;
          }).length;

          return (
            <div key={facet} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex">
              {/* Left color band — theme identity */}
              <div className="w-1 shrink-0" style={{ backgroundColor: group.color }} />
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-0.5"
                      style={{ color: group.color }}>{facet}</div>
                    <div className="text-sm font-semibold text-gray-800">{FACET_SUBTITLES[facet]}</div>
                  </div>
                  {/* Status badge */}
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: bg, color }}>
                    {label}
                  </span>
                </div>
                {/* Activity count summary */}
                <div className="flex gap-3 mt-3 text-xs text-gray-400">
                  {critCount > 0 && (
                    <button
                      onClick={() => onFacetClick(facet, "critical")}
                      className="text-[#FF3333] font-medium hover:underline transition-colors"
                    >
                      {critCount} at risk
                    </button>
                  )}
                  {watchCount > 0 && (
                    <button
                      onClick={() => onFacetClick(facet, "attention")}
                      className="text-[#D97706] font-medium hover:underline transition-colors"
                    >
                      {watchCount} to watch
                    </button>
                  )}
                  {critCount === 0 && watchCount === 0 && (
                    <span className="text-[#11CC77] font-medium">All on track</span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      ))}
    </div>
  );
}

// ── Main ReportPage ──────────────────────────────────────────────────────────

export default function ReportPage() {
  const { token } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activityStats, setActivityStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [respondentCount, setRespondentCount] = useState(0);
  const [totalRespondentCount, setTotalRespondentCount] = useState(0);
  const [filterLevel, setFilterLevel] = useState("problems"); // problems | critical | attention | all
  const [facetFilter, setFacetFilter] = useState(null); // null = all, or specific facet like "DEFINE"

  useEffect(() => {
    if (token) loadReport();
  }, [token]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Find assessment by buyer_token — list all and find client-side
      // (filter by arbitrary string fields is unreliable in some SDK versions)
      const allAssessments = await base44.entities.Assessment.list();
      const assessments = allAssessments.filter(a => a.buyer_token === token);
      if (!assessments || assessments.length === 0) {
        setError("Report not found. Please check your link.");
        setLoading(false);
        return;
      }
      const a = assessments[0];
      setAssessment(a);

      // Load activities, responses, and respondent count in parallel
      const [acts, responses, allRespondents] = await Promise.all([
        getAssignedActivities(a),
        base44.entities.Response.filter({ assessment_id: a.id }),
        base44.entities.Respondent.filter({ assessment_id: a.id }),
      ]);
      setTotalRespondentCount(allRespondents.length);

      setActivities(acts);
      // Derive participant count from distinct respondent_ids in responses
      const uniqueRespondents = new Set(responses.map(r => r.respondent_id));
      setRespondentCount(uniqueRespondents.size);

      // Build stats per activity
      const stats = {};
      for (const act of acts) {
        const actResps = responses.filter(r => r.activity_id === act.id);
        const impScores = actResps.map(r => IMPORTANCE_SCORE[r.importance]).filter(v => v !== undefined);
        const execScores = actResps.map(r => EXECUTION_SCORE[r.execution]).filter(v => v !== undefined);
        const avgImp  = avg(impScores);
        const avgExec = avg(execScores);
        const avgGap  = avgImp !== null && avgExec !== null ? avgImp - avgExec : null;

        // Owner tally
        const ownerTally = {};
        for (const r of actResps) {
          if (r.suggested_owner) {
            ownerTally[r.suggested_owner] = (ownerTally[r.suggested_owner] || 0) + 1;
          }
        }
        const ownerEntries = Object.entries(ownerTally).sort((a, b) => b[1] - a[1]);
        const topOwner = ownerEntries[0]?.[0] || null;
        const ownerAgreement = ownerEntries[0]
          ? ownerEntries[0][1] / actResps.filter(r => r.suggested_owner).length
          : null;

        stats[act.id] = { avgImp, avgExec, avgGap, n: actResps.length, topOwner, ownerAgreement, ownerEntries };
      }
      setActivityStats(stats);

    } catch (e) {
      console.error(e);
      setError("Something went wrong loading this report.");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#3366FF]/20 border-t-[#3366FF] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm shadow-sm">
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Minimum-response gate
  const threshold = Math.min(3, totalRespondentCount);

  const handleFacetClick = (facet, level) => {
    setFilterLevel(level);
    setFacetFilter(facet);
    setTimeout(() => {
      document.getElementById(facet)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleShowAll = () => {
    setFilterLevel("all");
    setFacetFilter(null);
  };

  const gateCard = (message) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-sm shadow-sm">
        <p className="text-gray-500 text-sm">{message}</p>
      </div>
    </div>
  );

  if (totalRespondentCount === 0) {
    return gateCard("No team members have been added to this assessment yet.");
  }

  if (respondentCount < threshold) {
    return gateCard(
      `Results will appear here once at least ${threshold} ${threshold === 1 ? "person has" : "people have"} responded — ${respondentCount} of ${threshold} so far.`
    );
  }

  // Compute headline numbers
  const allGaps = Object.values(activityStats).map(s => s.avgGap).filter(v => v !== null);
  const criticalGaps = allGaps.filter(g => g >= 2).length;
  const attentionGaps = allGaps.filter(g => g >= 1 && g < 2).length;
  const onTrackCount = allGaps.filter(g => g < 1).length;
  const problemCount = criticalGaps + attentionGaps;
  const importantOrCritical = Object.values(activityStats).filter(s => s.avgImp !== null && s.avgImp >= 2).length;
  const underperforming = Object.values(activityStats).filter(s => s.avgImp !== null && s.avgGap !== null && s.avgImp >= 2 && s.avgGap >= 1).length;

  const headlineSentence = importantOrCritical > 0
    ? underperforming === 0
      ? `Your team rated ${importantOrCritical} of ${activities.length} activities as Important or Critical — and execution is keeping pace across all of them.`
      : `Your team rated ${importantOrCritical} of ${activities.length} activities as Important or Critical — and execution is falling short on ${underperforming} of them.`
    : `Assessment data is available for ${activities.length} activities across ${respondentCount} respondents.`;

  // ── Plain-English summary bullets ────────────────────────────────────────
  const summaryBullets = [];

  // 1. Biggest gap theme
  const themeGapAvgs = THEME_GROUPS.map(group => {
    const acts = activities.filter(a => group.facets.includes(a.facet));
    const gaps = acts.map(a => activityStats[a.id]?.avgGap).filter(v => v !== null && v !== undefined);
    return { group, avg: avg(gaps) };
  }).filter(t => t.avg !== null).sort((a, b) => b.avg - a.avg);

  if (themeGapAvgs.length > 0 && themeGapAvgs[0].avg >= 1) {
    const worst = themeGapAvgs[0];
    const worstActs = activities
      .filter(a => worst.group.facets.includes(a.facet))
      .map(a => ({ ...a, gap: activityStats[a.id]?.avgGap ?? 0 }))
      .filter(a => a.gap >= 1)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 2);
    const actNames = worstActs.map(a => a.name).join(" and ");
    summaryBullets.push({
      icon: "🔴",
      text: `The biggest gaps are in **${worst.group.label}**${actNames ? ` — particularly ${actNames}` : ""}.`,
    });
  }

  // 2. Ownership pattern
  const ownerCounts = {};
  for (const stats of Object.values(activityStats)) {
    if (stats.topOwner && stats.ownerAgreement >= 0.5) {
      ownerCounts[stats.topOwner] = (ownerCounts[stats.topOwner] || 0) + 1;
    }
  }
  const topOwners = Object.entries(ownerCounts).sort((a, b) => b[1] - a[1]);
  const unclearOwnership = Object.values(activityStats).filter(s => s.topOwner && s.ownerAgreement < 0.5).length;
  const totalWithOwner = Object.values(activityStats).filter(s => s.topOwner).length;

  if (topOwners.length > 0) {
    const [topRole, topCount] = topOwners[0];
    if (unclearOwnership > 0) {
      summaryBullets.push({
        icon: "🟡",
        text: `**${topRole}** is the most commonly suggested owner (${topCount} ${topCount === 1 ? "activity" : "activities"}), but ownership is unclear on ${unclearOwnership} ${unclearOwnership === 1 ? "activity" : "activities"} — worth discussing as a team.`,
      });
    } else {
      summaryBullets.push({
        icon: "🟡",
        text: `There's strong agreement that **${topRole}** should own most activities, which is a good foundation for accountability.`,
      });
    }
  } else if (totalWithOwner > 0) {
    summaryBullets.push({
      icon: "🟡",
      text: `Ownership is unclear across most activities — your team doesn't yet have shared agreement on who's responsible for what. This is often the most valuable conversation to have.`,
    });
  }

  // 3. Bright spot — on-track activities with high importance
  const brightSpots = activities
    .filter(a => {
      const s = activityStats[a.id];
      return s && s.avgGap !== null && s.avgGap < 1 && s.avgImp !== null && s.avgImp >= 2;
    })
    .map(a => a.name)
    .slice(0, 2);

  if (brightSpots.length > 0) {
    summaryBullets.push({
      icon: "🟢",
      text: `Your team is executing well on **${brightSpots.join(" and ")}** — these are strengths to build on.`,
    });
  } else if (onTrackCount > 0) {
    summaryBullets.push({
      icon: "🟢",
      text: `${onTrackCount} ${onTrackCount === 1 ? "activity is" : "activities are"} on track — a starting point to build from.`,
    });
  }

  const dateStr = assessment?.created_date
    ? new Date(assessment.created_date).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : "";

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={PGL_LOGO} alt="Product Growth Leaders" className="h-8 object-contain" />
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">A Product Growth Leaders Assessment</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Title block ── */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{assessment.title}</h1>
          {assessment.company_name && (
            <p className="text-lg text-gray-500 mb-4">{assessment.company_name}</p>
          )}
          <p className="text-sm text-gray-400">{dateStr} · {respondentCount} participant{respondentCount !== 1 ? "s" : ""}</p>
        </div>

        {/* ── Context paragraph ── */}
        <p className="text-gray-500 leading-relaxed mb-8 text-sm max-w-2xl">
          This report summarizes how {assessment.company_name || "your team"} rates the key activities
          that turn good ideas into successful products. For each activity, your team assessed both
          how important it is and how well it's currently being done. The gaps between those two
          answers reveal where to focus.
        </p>

        {/* ── Headline finding ── */}
        <div className="bg-[#E1E8F5] border border-gray-100 rounded-2xl px-8 py-8 mb-10 shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Key finding</p>
          <p className="text-xl font-semibold leading-relaxed text-gray-900">{headlineSentence}</p>
          <div className="border-t border-gray-200 mt-6 pt-5 flex gap-8">
            <div>
              <span className="text-3xl font-bold text-[#E53E3E]">{criticalGaps}</span>
              <span className="text-sm text-gray-500 ml-2">critical gaps</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-[#D69E2E]">{attentionGaps}</span>
              <span className="text-sm text-gray-500 ml-2">need attention</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-[#11CC77]">{respondentCount}</span>
              <span className="text-sm text-gray-500 ml-2">{respondentCount === 1 ? "participant" : "participants"}</span>
            </div>
          </div>
        </div>

        {/* ── Plain-English summary ── */}
        {summaryBullets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-6 mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">What this means</h2>
            <ul className="space-y-4">
              {summaryBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-base mt-0.5 shrink-0">{b.icon}</span>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {b.text.split("**").map((part, j) =>
                      j % 2 === 1
                        ? <strong key={j} className="font-semibold text-gray-900">{part}</strong>
                        : part
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Facet overview ── */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Overview by phase</h2>
          <FacetWheel activityStats={activityStats} activities={activities} onFacetClick={handleFacetClick} />
        </div>

        {/* ── Clickable filter chips ── */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          {[
            { key: "critical", color: "#FF3333", label: `Critical gap`, count: criticalGaps },
            { key: "attention", color: "#FFCC00", label: `Needs attention`, count: attentionGaps },
            { key: "ontrack", color: "#11CC77", label: `On track`, count: onTrackCount },
          ].map(({ key, color, label, count }) => {
            const isActive = filterLevel === key ||
              (filterLevel === "problems" && (key === "critical" || key === "attention"));
            return (
              <button
                key={key}
                onClick={() => setFilterLevel(f => f === key ? "problems" : key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  isActive
                    ? "shadow-sm"
                    : "opacity-40 hover:opacity-70"
                }`}
                style={{
                  borderColor: color,
                  backgroundColor: isActive ? color + "18" : "white",
                  color: key === "attention" ? "#92700A" : key === "ontrack" ? "#065F46" : "#991B1B",
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label}
                <span className="font-bold" style={{ color }}>{count}</span>
              </button>
            );
          })}
          <span className="text-xs text-gray-400 ml-2">
            {filterLevel === "all"
              ? `Showing all ${activities.length} activities`
              : filterLevel === "critical"
              ? `Showing ${criticalGaps} critical gap${criticalGaps !== 1 ? "s" : ""}`
              : filterLevel === "attention"
              ? `Showing ${attentionGaps} needing attention`
              : filterLevel === "ontrack"
              ? `Showing ${onTrackCount} on-track ${onTrackCount === 1 ? "activity" : "activities"}`
              : `Showing ${problemCount} of ${activities.length} activities`}
            {filterLevel !== "all" && (
              <button
                onClick={handleShowAll}
                className="ml-2 text-[#3366FF] hover:text-[#003366] font-medium transition-colors"
              >
                Show all
              </button>
            )}
          </span>
        </div>

        {/* ── Theme sections ── */}
        {THEME_GROUPS.map(group => (
          <ThemeSection
            key={group.label}
            group={group}
            activities={activities}
            activityStats={activityStats}
            filterLevel={filterLevel}
            facetFilter={facetFilter}
          />
        ))}

        {/* ── Footer ── */}
        <footer className="mt-16 pt-8 border-t border-gray-100 flex items-center justify-between">
          <img src={PGL_LOGO} alt="Product Growth Leaders" className="h-6 object-contain opacity-40" />
          <p className="text-xs text-gray-300">© Product Growth Leaders · productgrowthleaders.com</p>
        </footer>

      </main>
    </div>
  );
}