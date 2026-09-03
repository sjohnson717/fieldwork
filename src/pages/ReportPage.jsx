import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { getBuyerReport } from "@/lib/public-assessment";
import { ownerMatchesRecommendation } from "@/lib/ownership";
import { usePrintSafeUrl } from "@/lib/print-safe-url";
import { claimToken } from "@/lib/token-address";
import GapBar from "@/components/GapBar";
import ExecSummary from "@/components/ExecSummary";
import ChaosAssessmentPlug from "@/components/ChaosAssessmentPlug";
import {
  THEME_GROUPS,
  FACET_SUBTITLES,
  FACET_ORDER,
  GAP_BUCKETS,
  avg,
  fmt,
  gapColor,
  gapLabel,
  computeActivityStats,
  computeGapMix,
} from "@/lib/scoring";

// ── Brand ────────────────────────────────────────────────────────────────────
const QUARTZ_LOGO = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";

// ── Sub-components ───────────────────────────────────────────────────────────



function ActivityRow({ activity, stats }) {
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
              stats.ownerAgreement < 0.5 ? "Discuss owner" :
              (activity.preferred_owner && !ownerMatchesRecommendation(stats.topOwner, activity.preferred_owner)) ? "Discuss owner" :
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
          <GapBar importance={stats.avgImp} execution={stats.avgExec} />
          {(stats.ownerEntries?.length > 0 || activity.preferred_owner) && (
            <div className="space-y-1">
              {stats.ownerEntries?.length > 0 && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">Owns it today: </span>
                  {stats.ownerEntries.map(([name, count], i) => (
                    <span key={name}>
                      {i > 0 && <span className="text-gray-300 mx-1">·</span>}
                      <span className="text-gray-700">{name}</span>
                      <span className="text-gray-400 ml-0.5">({count})</span>
                    </span>
                  ))}
                  {stats.ownerNone > 0 && (
                    <span className="text-gray-400"> · {stats.ownerNone} said no one owns it</span>
                  )}
                  {stats.ownerUnknown > 0 && (
                    <span className="text-gray-400"> · {stats.ownerUnknown} didn't know</span>
                  )}
                  {/* A team that agrees nobody owns something is not unclear —
                      it is clear, and the answer is nobody. Saying "unclear"
                      there would soften the strongest finding this question
                      produces into a shrug. It has to actually lead, though:
                      one "no one" against one named role is a tie, and a tie is
                      exactly what "unclear" is for. */}
                  {stats.ownerNone > (stats.ownerEntries[0]?.[1] || 0) ? (
                    <span className="ml-2 text-amber-600 font-medium">⚠ nobody owns this</span>
                  ) : stats.ownerAgreement < 0.6 ? (
                    <span className="ml-2 text-amber-600 font-medium">⚠ ownership unclear</span>
                  ) : null}
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

// A paired theme lists its facets ("PREPARE · DELIVER"); a standalone one would
// just repeat its own name, so it shows the facet's subtitle instead.
const facetCaption = (group) =>
  group.standalone
    ? FACET_SUBTITLES[group.facets[0]]
    : group.facets.join(" · ");

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
              <p className="text-xs text-gray-400">{facetCaption(group)}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-sm text-[#11CC77] font-medium flex items-center gap-2">
              <span>✓</span> All activities performing well in this area
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

  return (
    <section className="mb-10">
      {/* Theme header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <div>
          <h2 className="text-lg font-bold text-gray-900">{group.label}</h2>
          <p className="text-xs text-gray-400">
            {facetCaption(group)}
            {themeAvgGap !== null && (
              <span className="ml-3 font-semibold" style={{ color: gapColor(themeAvgGap) }}>
                avg gap {fmt(themeAvgGap)}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="ml-2 text-[#FF3333] font-medium">{criticalCount} need focus</span>
            )}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {byFacet.map(({ facet, subtitle, items }) => (
          <div key={facet}>
            {/* Facet sub-header. A standalone group keeps the anchor — the facet
                wheel scrolls to it — but drops the bar, since the section header
                immediately above already says the same word. */}
            {group.standalone ? (
              <div id={facet} />
            ) : (
              <div id={facet} className="px-5 py-2.5 border-b border-gray-50"
                style={{ backgroundColor: group.lightColor }}>
                <span className="text-xs font-bold uppercase tracking-widest text-gray-900">
                  {facet}
                </span>
                <span className="text-xs text-gray-400 ml-2">{subtitle}</span>
              </div>
            )}
            {items.map(act => (
              <ActivityRow
                key={act.id}
                activity={act}
                stats={activityStats[act.id]}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// The whole assessment as one band of colour, then the same band per facet.
//
// The respondent reports carry the same card, and for the same reason: the
// sections below answer "how is each activity doing" and nothing answered "what
// shape is this". A team with two thirds of its scope in the red is being told
// one thing, not eighteen.
//
// Per facet it answers a question the wheel below cannot. That badges a phase by
// its average gap, which is the right shorthand for how the phase is doing and
// the wrong one for how much of it is in trouble — one severe gap among five
// healthy activities averages away to "performing well", and the band keeps it
// visible. The two are complementary: the wheel is also the navigation, since
// its counts are the links that filter the list.
//
// No numbers on the bands themselves — a one-activity band has no room, and a
// count that only appears on the wide ones reads as a ranking. Totals sit at the
// end of each row and in the key.
function ShapeOfAnswers({ mix }) {
  if (mix.total === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-6 mb-10 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">The shape of the assessment</h2>
        <span className="text-xs text-gray-400 shrink-0">
          {mix.total} {mix.total === 1 ? "activity" : "activities"}
        </span>
      </div>

      {/* Hairline gaps and each band with its own corners rather than one
          rounded strip. Printed in black and white the three colours collapse
          to much the same grey, and a clipped outline on the "not enough
          answers" band loses whichever side the clip lands on — which reads as
          a broken bar rather than an empty one. */}
      <div className="flex h-8 gap-px mb-2">
        {mix.overall.map(seg => (
          <div
            key={seg.key}
            className={`rounded-sm ${GAP_BUCKETS[seg.key].fill}`}
            style={{ width: `${seg.share * 100}%` }}
          />
        ))}
      </div>

      {/* Saying the order out loud is what makes this survive a black and white
          printer: the swatches go grey with everything else, and position is
          then the only thing that still identifies a band. */}
      <p className="text-[11px] text-gray-400 mb-3">Bands run left to right in the order of this key.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-6">
        {mix.overall.map(seg => (
          <div key={seg.key} className="flex items-baseline gap-2">
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 translate-y-0.5 ${GAP_BUCKETS[seg.key].fill}`} />
            <span className="text-xs text-gray-600 leading-snug flex-1">{GAP_BUCKETS[seg.key].label}</span>
            <span className="text-xs text-gray-400 shrink-0">{seg.count}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-5">
        <div className="text-[11px] text-gray-400 mb-3">Where they sit across the product lifecycle</div>
        <div className="space-y-2">
          {mix.byFacet.map(row => (
            <div key={row.facet} className="flex items-center gap-3">
              {/* Plain text, not a link to the phase. Making these clickable
                  put seven 13px-tall tap targets on a phone, the smallest on
                  the page, to duplicate navigation the wheel below already
                  owns — its counts are the links that filter the list. */}
              <div className="w-20 sm:w-28 shrink-0 text-right leading-tight">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-900">{row.facet}</div>
                <div className="text-[10px] text-gray-400 hidden sm:block">{FACET_SUBTITLES[row.facet]}</div>
              </div>
              {/* Scaled against the busiest phase rather than each row filling
                  the width: a phase holding two activities should look smaller
                  than one holding six, which is most of what this view is for. */}
              <div className="flex-1 flex gap-0.5 h-4">
                {row.segments.map(seg => (
                  <div
                    key={seg.key}
                    className={`rounded-sm ${GAP_BUCKETS[seg.key].fill}`}
                    style={{ width: `${(seg.count / mix.facetMax) * 100}%` }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-gray-400 w-4 shrink-0 text-right">{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FacetWheel({ activityStats, activities, onFacetClick }) {
  const statusLabel = (gap) => {
    if (gap === null) return { label: "No data",       color: "#9CA3AF", bg: "#F3F4F6" };
    if (gap >= 2)     return { label: "Needs focus",   color: "#FF3333", bg: "#FFF1F1" };
    if (gap >= 1)     return { label: "Worth discussing", color: "#D97706", bg: "#FFFBEB" };
    return              { label: "Performing well", color: "#11CC77", bg: "#ECFDF5" };
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
                    <div className="text-xs font-bold uppercase tracking-widest mb-0.5 text-gray-900">{facet}</div>
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
                      {critCount} need focus
                    </button>
                  )}
                  {watchCount > 0 && (
                    <button
                      onClick={() => onFacetClick(facet, "attention")}
                      className="text-[#D97706] font-medium hover:underline transition-colors"
                    >
                      {watchCount} worth discussing
                    </button>
                  )}
                  {critCount === 0 && watchCount === 0 && (
                    <span className="text-[#11CC77] font-medium">All performing well</span>
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
  const { token: tokenInPath } = useParams();
  // Claimed on the first render rather than in an effect, so the address is
  // already clean before anything paints — a print or a screenshot taken
  // immediately cannot catch the token. Idempotent, so a StrictMode double
  // invoke changes nothing. See lib/token-address.js for why the address cannot
  // hold a credential on a page that prints.
  const [token] = useState(() => claimToken("buyer", tokenInPath, "/report"));
  // Secondary now that the address carries no token: it still strips on
  // beforeprint, which covers any surface that has not moved to claimToken.
  usePrintSafeUrl();
  const [assessment, setAssessment] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activityStats, setActivityStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Everyone who answered anything vs. only those who finished. The report
  // scores the latter and reports both.
  const [participantCount, setParticipantCount] = useState(0);
  const [scoredCount, setScoredCount] = useState(0);
  const [filterLevel, setFilterLevel] = useState("problems"); // problems | critical | attention | all
  const [facetFilter, setFacetFilter] = useState(null); // null = all, or specific facet like "DEFINE"
  const [decisions, setDecisions] = useState([]);
  const [parkedItems, setParkedItems] = useState([]);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    // No token in the path and none in this tab's storage: someone reloaded a
    // cleaned address in a new tab, or typed /report. That is the same dead end
    // as a bad token, and it has to say so — the early return this replaced left
    // the page on its loading spinner for ever.
    if (!token) {
      setError("Report not found. Please check your link.");
      setLoading(false);
      return;
    }
    loadReport();
  }, [token]);

  // Carries the assessment's own name once it loads. Every browser offers the
  // tab title as the filename when you Save as PDF, so a constant here meant
  // every report anyone ever saved was called "Report | Quartz Assessment" —
  // and a file named after the app rather than the engagement is no use in a
  // folder of client work. Re-runs when the title changes, so a renamed
  // assessment names its next download correctly.
  useEffect(() => {
    document.title = assessment?.title
      ? `${assessment.title} | Quartz Assessments`
      : "Report | Quartz Assessments";
  }, [assessment?.title]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Resolved server-side so the buyer token stays a credential rather
      // than something anyone can read off a listing.
      const result = await getBuyerReport(token);
      if (!result?.assessment) {
        setError("Report not found. Please check your link.");
        setLoading(false);
        return;
      }
      const a = result.assessment;
      // This report is built entirely from importance and execution, which a
      // personal assessment never collects. Every buyer token resolves, so
      // without this the page would render a full report of empty bars.
      if (a.assessment_type === "personal") {
        setError("This link points to a personal assessment, which doesn't have a gap report.");
        setLoading(false);
        return;
      }
      setAssessment(a);

      // The answers come back with the token lookup rather than being read
      // from the browser: Response.read is no longer open to the world, and an
      // open read there returned every answer in the app to anyone who asked,
      // not merely the ones behind this buyer token.
      const responses = result.responses || [];

      // Load activities and discussion notes in parallel
      const [acts, discussionNotes] = await Promise.all([
        getAssignedActivities(a),
        base44.entities.DiscussionNote.filter({ assessment_id: a.id }),
      ]);

      setActivities(acts);

      // Only completed submissions are scored. A half-finished set would
      // otherwise shift every average it touches while being counted as a
      // full participant.
      const completedIds = new Set(
        (result.respondents || []).filter(r => r.status === "completed").map(r => r.id)
      );
      const scoredResponses = responses.filter(r => completedIds.has(r.respondent_id));

      setParticipantCount(new Set(responses.map(r => r.respondent_id)).size);
      setScoredCount(new Set(scoredResponses.map(r => r.respondent_id)).size);

      const stats = computeActivityStats(acts, scoredResponses);
      setActivityStats(stats);

      const withDecisions = discussionNotes.filter(n => n.decision?.trim());
      setDecisions(withDecisions);
      const parked = discussionNotes.filter(n => n.status === "parked");
      setParkedItems(parked);

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
  const threshold = Math.min(3, scoredCount);

  const gapMix = computeGapMix(activities, activityStats, FACET_ORDER);

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

  if (participantCount === 0) {
    return gateCard("No team members have been added to this assessment yet.");
  }

  // Started-but-unfinished responses are not scored, so say so rather than
  // claiming nobody has responded.
  if (scoredCount === 0) {
    return gateCard(
      `Results will appear here once responses are completed — ${participantCount} ${participantCount === 1 ? "person has" : "people have"} started, none finished yet.`
    );
  }

  if (scoredCount < threshold) {
    return gateCard(
      `Results will appear here once at least ${threshold} ${threshold === 1 ? "person has" : "people have"} completed the assessment — ${scoredCount} of ${threshold} so far.`
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
    : `Assessment data is available for ${activities.length} activities across ${scoredCount} respondents.`;

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
        text: `**${topRole}** is most often named as owning this today (${topCount} ${topCount === 1 ? "activity" : "activities"}), but ownership is unclear on ${unclearOwnership} ${unclearOwnership === 1 ? "activity" : "activities"} — worth discussing as a team.`,
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
      text: `Your team is performing well on **${brightSpots.join(" and ")}** — these are strengths to build on.`,
    });
  } else if (onTrackCount > 0) {
    summaryBullets.push({
      icon: "🟢",
      text: `${onTrackCount} ${onTrackCount === 1 ? "activity is" : "activities are"} performing well — a foundation to build from.`,
    });
  }

  const dateStr = assessment?.created_date
    ? new Date(assessment.created_date).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : "";

  return (
    <div className="min-h-screen bg-gray-50 print-plain">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 shadow-sm no-print">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={QUARTZ_LOGO} alt="Quartz Assessment" className="h-8 object-contain" />
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Quartz Assessment</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Title block ── */}
        <div className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{assessment.title}</h1>
            <button
              onClick={() => window.print()}
              className="no-print shrink-0 border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Save as PDF
            </button>
          </div>
          {assessment.company_name && (
            <p className="text-lg text-gray-500 mb-4">{assessment.company_name}</p>
          )}
          {assessment.tagline && (
            <p className="text-base text-gray-400 italic mb-4">{assessment.tagline}</p>
          )}
          <p className="text-sm text-gray-400">
            {dateStr} · {participantCount} participant{participantCount !== 1 ? "s" : ""}
            {participantCount !== scoredCount && ` (${scoredCount} completed)`}
          </p>
        </div>

        {/* ── Executive Summary ── */}
        <ExecSummary
          assessment={assessment}
          activities={activities}
          activityStats={activityStats}
          respondentCount={scoredCount}
          decisions={decisions}
        />

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
              <span className="text-sm text-gray-500 ml-2">immediate attention</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-[#D69E2E]">{attentionGaps}</span>
              <span className="text-sm text-gray-500 ml-2">worth discussing</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-[#11CC77]">{scoredCount}</span>
              <span className="text-sm text-gray-500 ml-2">{scoredCount === 1 ? "participant" : "participants"}</span>
            </div>
          </div>
        </div>

        {/* ── The shape of it ──
            Directly under the key finding, which gives two of these counts as
            bare numbers. The bar is the same counts as a proportion, which is
            what turns "6 need attention" into "and 12 do not". */}
        <ShapeOfAnswers mix={gapMix} />

        {/* ── Plain-English summary ── */}
        {summaryBullets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-6 mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Key Insights</h2>
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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Overview by Quartz facet</h2>
          <FacetWheel activityStats={activityStats} activities={activities} onFacetClick={handleFacetClick} />
        </div>

        {/* ── Clickable filter chips ── */}
        <div className="flex items-center gap-2 mb-8 flex-wrap no-print">
          {[
            { key: "critical", color: "#FF3333", label: `Immediate attention`, count: criticalGaps },
            { key: "attention", color: "#FFCC00", label: `Worth discussing`, count: attentionGaps },
            { key: "ontrack", color: "#11CC77", label: `Performing well`, count: onTrackCount },
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
              ? `Showing ${criticalGaps} ${criticalGaps === 1 ? "activity" : "activities"} needing immediate attention`
              : filterLevel === "attention"
              ? `Showing ${attentionGaps} ${attentionGaps === 1 ? "activity" : "activities"} worth discussing`
              : filterLevel === "ontrack"
              ? `Showing ${onTrackCount} ${onTrackCount === 1 ? "activity" : "activities"} performing well`
              : `Showing ${problemCount} of ${activities.length} activities`}
            {filterLevel !== "all" && (
              <button
                onClick={handleShowAll}
                className="ml-2 text-[#3366FF] hover:text-[#003366] font-medium transition-colors"
              >
                View all activities
              </button>
            )}
          </span>
        </div>

        {/* On paper the chips are gone, so say plainly which activities this
            copy covers — otherwise a filtered report reads as the whole set. */}
        <p className="print-only text-xs text-gray-500 mb-6">
          {filterLevel === "all"
            ? `All ${activities.length} activities.`
            : filterLevel === "critical"
            ? `Filtered to the ${criticalGaps} ${criticalGaps === 1 ? "activity" : "activities"} needing immediate attention.`
            : filterLevel === "attention"
            ? `Filtered to the ${attentionGaps} ${attentionGaps === 1 ? "activity" : "activities"} worth discussing.`
            : filterLevel === "ontrack"
            ? `Filtered to the ${onTrackCount} ${onTrackCount === 1 ? "activity" : "activities"} performing well.`
            : `Filtered to the ${problemCount} of ${activities.length} activities needing attention.`}
        </p>

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

        {/* ── Decisions & Actions ── */}
        {assessment.status === "closed" && decisions.length > 0 && (() => {
          const decisionsByTheme = THEME_GROUPS.map(group => {
            const themeActs = activities.filter(a => group.facets.includes(a.facet));
            const themeDecisions = themeActs
              .map(act => {
                const note = decisions.find(d => d.activity_id === act.id);
                return note ? { activity: act, decision: note.decision.trim(), decision_role: note.decision_role || "" } : null;
              })
              .filter(Boolean);
            return { group, themeDecisions };
          }).filter(t => t.themeDecisions.length > 0);

          if (decisionsByTheme.length === 0) return null;

          return (
            <section className="mt-16">
              <div className="border-t-2 border-gray-200 pt-10 mb-8">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Workshop outcomes</p>
                <h2 className="text-2xl font-bold text-gray-900">Team decisions and next steps</h2>
                <p className="text-sm text-gray-500 mt-2">Commitments and actions agreed during the facilitated workshop.</p>
              </div>

              {decisionsByTheme.map(({ group, themeDecisions }) => (
                <div key={group.label} className="mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <h3 className="text-base font-bold text-gray-900">{group.label}</h3>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {themeDecisions.map(({ activity, decision, decision_role }, idx) => (
                      <div key={activity.id} className={`px-6 py-4 ${idx < themeDecisions.length - 1 ? "border-b border-gray-50" : ""}`}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{activity.name}</p>
                        <p className="text-sm text-gray-800 leading-relaxed">{decision}</p>
                        {decision_role && (
                          <p className="text-xs text-gray-400 mt-1">Responsible: {decision_role}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })()}

        {/* ── Open issues (parked) ── */}
        {assessment.status === "closed" && parkedItems.length > 0 && (() => {
          const parkedByTheme = THEME_GROUPS.map(group => {
            const themeActs = activities.filter(a => group.facets.includes(a.facet));
            const themeParked = themeActs
              .map(act => {
                const note = parkedItems.find(n => n.activity_id === act.id);
                return note ? { activity: act, note: note.note || "" } : null;
              })
              .filter(Boolean);
            return { group, themeParked };
          }).filter(t => t.themeParked.length > 0);

          if (parkedByTheme.length === 0) return null;

          return (
            <section className="mt-16">
              <div className="border-t-2 border-gray-200 pt-10 mb-8">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Follow-up</p>
                <h2 className="text-2xl font-bold text-gray-900">Open issues</h2>
                <p className="text-sm text-gray-500 mt-2">Items parked during the workshop for follow-up after the session.</p>
              </div>

              {parkedByTheme.map(({ group, themeParked }) => (
                <div key={group.label} className="mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <h3 className="text-base font-bold text-gray-900">{group.label}</h3>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {themeParked.map(({ activity, note }, idx) => (
                      <div key={activity.id} className={`px-6 py-4 ${idx < themeParked.length - 1 ? "border-b border-gray-50" : ""}`}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{activity.name}</p>
                        <p className="text-sm text-gray-800 leading-relaxed">{note.trim() || "Parked for follow-up after the workshop."}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })()}

        {/* Screen only, as on the respondent reports: the pointer is worth
            having where it can be clicked, and a printed deliverable handed to
            a client should close on its findings rather than a pitch. */}
        <div className="no-print"><ChaosAssessmentPlug /></div>

        {/* ── Footer ──
            The notice names Product Growth Leaders rather than the app: what is
            authored here is the instrument — the activity library, the facets,
            the thresholds these findings are read against — and Quartz is the
            software it is delivered through.

            Scoped, like the respondent report's, but scoped differently. That
            one reassures a person that their own answers aren't being claimed;
            this one goes to the organisation that commissioned the work, whose
            half is the data and what it says about them. Deliberately no
            "prepared by" line to match: an assessment can be run by another
            firm's facilitator through this app, and the framework being
            authored here doesn't make them the author of the engagement. */}
        <footer className="mt-16 pt-8 border-t border-gray-100 flex items-center justify-between gap-6">
          <img src={QUARTZ_LOGO} alt="Quartz Assessment" className="h-6 object-contain opacity-40 shrink-0" />
          {/* Set small and right-aligned so it stays on the logo's line: the
              notice it replaced was four words, and at the printed column width
              this one wrapped underneath, leaving the mark stranded on a line
              of its own. */}
          <p className="text-[10px] text-gray-300 text-right">
            Assessment framework © {new Date().getFullYear()} Product Growth Leaders.
            Responses and findings belong to your organization.
          </p>
        </footer>

      </main>
    </div>
  );
}