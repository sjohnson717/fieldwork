import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";

// ── Constants (mirrored from ReportPage) ─────────────────────────────────────
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

const gapColor = (gap) => {
  if (gap === null) return "#E5E7EB";
  if (gap >= 2) return "#FF3333";
  if (gap >= 1) return "#FFCC00";
  return "#11CC77";
};

const gapLabel = (gap) => {
  if (gap === null) return "No data";
  if (gap >= 2) return "Critical gap";
  if (gap >= 1) return "Needs attention";
  return "On track";
};

// ── Sub-components ────────────────────────────────────────────────────────────

function GapBar({ importance, execution }) {
  const impPct  = importance !== null ? (importance / 3) * 100 : 0;
  const execPct = execution  !== null ? (execution  / 3) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Importance</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#3366FF] transition-all" style={{ width: `${impPct}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">
          {importance !== null ? IMPORTANCE_LABEL[Math.round(importance)] : "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">Execution</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[200px]">
          <div className="h-2 rounded-full bg-[#11CC77] transition-all" style={{ width: `${execPct}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 w-20 shrink-0">
          {execution !== null ? EXECUTION_LABEL[Math.round(execution)] : "—"}
        </span>
      </div>
    </div>
  );
}

function ActivityRow({ activity, stats, note, draftNote, draftDecision, saving, onDraftNoteChange, onDraftDecisionChange, onSave, onToggleFlag }) {
  const [expanded, setExpanded] = useState(false);
  const gap = stats?.avgGap ?? null;
  const dot = gapColor(gap);
  const isFlagged = note?.flagged;
  const hasDecision = note?.decision?.trim();

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800">{activity.name}</span>
          {activity.description && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{activity.description}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {stats?.ownerEntries?.length > 0 && (() => {
            const ownerBadge =
              stats.ownerAgreement < 0.5 ? "Owner unclear" :
              (activity.preferred_owner && stats.topOwner !== activity.preferred_owner) ? "Discuss owner" :
              null;
            return ownerBadge ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#6D28D9]">
                {ownerBadge}
              </span>
            ) : null;
          })()}
          {hasDecision && (
            <span className="text-xs font-medium text-green-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Decision recorded
            </span>
          )}
          {gap !== null && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: dot + "22",
                color: gap >= 2 ? "#991B1B" : gap >= 1 ? "#92700A" : "#065F46",
              }}
            >
              {gapLabel(gap)}
            </span>
          )}
          {/* Flag button */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFlag(activity.id); }}
            className={`transition-colors ${isFlagged ? "text-amber-500 hover:text-amber-700" : "text-gray-300 hover:text-amber-400"}`}
            title={isFlagged ? "Remove flag" : "Flag for discussion"}
          >
            <svg className="w-4 h-4" fill={isFlagged ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V5l7-2 4 2 7-2v13l-7 2-4-2-7 2z" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-4">
          {stats && (
            <>
              <GapBar importance={stats.avgImp} execution={stats.avgExec} />
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
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              DISCUSSION NOTES (Internal use only; will not be shared with client)
            </label>
            <textarea
              rows={3}
              placeholder="Add notes for the debrief conversation…"
              value={draftNote || ""}
              onChange={e => onDraftNoteChange(activity.id, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          {/* Decision */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Decision / action
            </label>
            <input
              type="text"
              placeholder="What was decided or committed to?"
              value={draftDecision || ""}
              onChange={e => onDraftDecisionChange(activity.id, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => onSave(activity.id)}
              disabled={saving}
              className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeSection({ group, activities, activityStats, filterLevel, notes, draftNote, draftDecision, saving, onDraftNoteChange, onDraftDecisionChange, onSave, onToggleFlag }) {
  const groupActivities = activities.filter(a => group.facets.includes(a.facet));
  if (groupActivities.length === 0) return null;

  const visibleActivities = groupActivities.filter(a => {
    const gap = activityStats[a.id]?.avgGap ?? null;
    if (filterLevel === "all") return true;
    if (filterLevel === "critical") return gap !== null && gap >= 2;
    if (filterLevel === "attention") return gap !== null && gap >= 1 && gap < 2;
    if (filterLevel === "ontrack") return gap !== null && gap < 1;
    return gap === null || gap >= 1;
  });

  if (visibleActivities.length === 0) {
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
    return null;
  }

  const byFacet = group.facets.map(f => ({
    facet: f,
    subtitle: FACET_SUBTITLES[f],
    items: visibleActivities.filter(a => a.facet === f),
  })).filter(f => f.items.length > 0);

  const themeGaps = groupActivities
    .map(a => activityStats[a.id]?.avgGap)
    .filter(v => v !== null && v !== undefined);
  const themeAvgGap = avg(themeGaps);
  const criticalCount = groupActivities.filter(a => (activityStats[a.id]?.avgGap ?? 0) >= 2).length;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <div>
          <h2 className="text-lg font-bold text-gray-900">{group.label}</h2>
          <p className="text-xs text-gray-400">
            {group.facets.join(" · ")}
            {themeAvgGap !== null && (
              <span className="ml-3 font-semibold" style={{ color: gapColor(themeAvgGap) }}>
                avg gap {themeAvgGap.toFixed(1)}
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
            <div className="px-5 py-2.5 border-b border-gray-50" style={{ backgroundColor: group.lightColor }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: group.color }}>
                {facet}
              </span>
              <span className="text-xs text-gray-400 ml-2">{subtitle}</span>
            </div>
            {items.map(act => (
              <ActivityRow
                key={act.id}
                activity={act}
                stats={activityStats[act.id]}
                note={notes[act.id]}
                draftNote={draftNote[act.id]}
                draftDecision={draftDecision[act.id]}
                saving={saving[act.id]}
                onDraftNoteChange={onDraftNoteChange}
                onDraftDecisionChange={onDraftDecisionChange}
                onSave={onSave}
                onToggleFlag={onToggleFlag}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssessmentDiscussion({ assessment }) {
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState({});
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState("problems");
  const [draftNote, setDraftNote] = useState({});
  const [draftDecision, setDraftDecision] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, existingNotes, resps] = await Promise.all([
        getAssignedActivities(assessment),
        base44.entities.DiscussionNote.filter({ assessment_id: assessment.id }),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      setActivities(acts);
      setResponses(resps);
      const noteMap = {};
      for (const n of existingNotes) noteMap[n.activity_id] = n;
      setNotes(noteMap);
      const noteDrafts = {}, decDrafts = {};
      for (const n of existingNotes) {
        noteDrafts[n.activity_id] = n.note || "";
        decDrafts[n.activity_id] = n.decision || "";
      }
      setDraftNote(noteDrafts);
      setDraftDecision(decDrafts);
    } catch (e) {
      console.error("Failed to load discussion data", e);
    }
    setLoading(false);
  };

  const handleSave = async (activityId) => {
    setSaving(s => ({ ...s, [activityId]: true }));
    try {
      const existing = notes[activityId];
      const payload = {
        assessment_id: assessment.id,
        activity_id: activityId,
        note: draftNote[activityId] || "",
        decision: draftDecision[activityId] || "",
        flagged: existing?.flagged || false,
      };
      const saved = existing
        ? await base44.entities.DiscussionNote.update(existing.id, payload)
        : await base44.entities.DiscussionNote.create(payload);
      setNotes(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to save note", e);
    }
    setSaving(s => ({ ...s, [activityId]: false }));
  };

  const handleToggleFlag = async (activityId) => {
    const existing = notes[activityId];
    const newFlagged = !(existing?.flagged);
    try {
      const saved = existing
        ? await base44.entities.DiscussionNote.update(existing.id, { flagged: newFlagged })
        : await base44.entities.DiscussionNote.create({
            assessment_id: assessment.id,
            activity_id: activityId,
            note: "",
            decision: "",
            flagged: newFlagged,
          });
      setNotes(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to toggle flag", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
      </div>
    );
  }

  // Build per-activity stats
  const activityStats = {};
  for (const act of activities) {
    const actResps = responses.filter(r => r.activity_id === act.id);
    const impScores = actResps.map(r => IMPORTANCE_SCORE[r.importance]).filter(v => v !== undefined);
    const execScores = actResps.map(r => EXECUTION_SCORE[r.execution]).filter(v => v !== undefined);
    const avgImp  = avg(impScores);
    const avgExec = avg(execScores);
    const avgGap  = avgImp !== null && avgExec !== null ? avgImp - avgExec : null;
    const ownerTally = {};
    for (const r of actResps) {
      if (r.suggested_owner) ownerTally[r.suggested_owner] = (ownerTally[r.suggested_owner] || 0) + 1;
    }
    const ownerEntries = Object.entries(ownerTally).sort((a, b) => b[1] - a[1]);
    const topOwner = ownerEntries[0]?.[0] || null;
    const ownerWithSuggestion = actResps.filter(r => r.suggested_owner).length;
    const ownerAgreement = ownerEntries[0] && ownerWithSuggestion > 0
      ? ownerEntries[0][1] / ownerWithSuggestion
      : null;
    activityStats[act.id] = { avgImp, avgExec, avgGap, n: actResps.length, ownerEntries, topOwner, ownerAgreement };
  }

  const allGaps = Object.values(activityStats).map(s => s.avgGap).filter(v => v !== null);
  const criticalGaps   = allGaps.filter(g => g >= 2).length;
  const attentionGaps  = allGaps.filter(g => g >= 1 && g < 2).length;
  const onTrackCount   = allGaps.filter(g => g < 1).length;
  const problemCount   = criticalGaps + attentionGaps;

  const flaggedCount  = Object.values(notes).filter(n => n.flagged).length;
  const decidedCount  = Object.values(notes).filter(n => n.decision?.trim()).length;

  return (
    <div className="p-8">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm text-gray-500 mb-8">
        <span>
          <span className="font-semibold text-amber-600">{flaggedCount}</span> flagged for discussion
        </span>
        <span>
          <span className="font-semibold text-green-700">{decidedCount}</span> with decisions recorded
        </span>
        <span className="text-gray-400">{activities.length} total activities</span>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {[
          { key: "critical",  color: "#FF3333", label: "Critical gap",      count: criticalGaps  },
          { key: "attention", color: "#FFCC00", label: "Needs attention",   count: attentionGaps },
          { key: "ontrack",   color: "#11CC77", label: "On track",          count: onTrackCount  },
        ].map(({ key, color, label, count }) => {
          const isActive = filterLevel === key ||
            (filterLevel === "problems" && (key === "critical" || key === "attention"));
          return (
            <button
              key={key}
              onClick={() => setFilterLevel(f => f === key ? "problems" : key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                isActive ? "shadow-sm" : "opacity-40 hover:opacity-70"
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
              onClick={() => setFilterLevel("all")}
              className="ml-2 text-[#3366FF] hover:text-[#003366] font-medium transition-colors"
            >
              Show all
            </button>
          )}
        </span>
      </div>

      {/* Theme sections */}
      {THEME_GROUPS.map(group => (
        <ThemeSection
          key={group.label}
          group={group}
          activities={activities}
          activityStats={activityStats}
          filterLevel={filterLevel}
          notes={notes}
          draftNote={draftNote}
          draftDecision={draftDecision}
          saving={saving}
          onDraftNoteChange={(id, val) => setDraftNote(prev => ({ ...prev, [id]: val }))}
          onDraftDecisionChange={(id, val) => setDraftDecision(prev => ({ ...prev, [id]: val }))}
          onSave={handleSave}
          onToggleFlag={handleToggleFlag}
        />
      ))}
    </div>
  );
}