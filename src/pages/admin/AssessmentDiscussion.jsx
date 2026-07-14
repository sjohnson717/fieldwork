import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import {
  THEME_GROUPS,
  FACET_SUBTITLES,
  IMPORTANCE_LABEL,
  EXECUTION_LABEL,
  avg,
  gapColor,
  gapLabel,
  computeActivityStats,
} from "@/lib/scoring";

const STATUS_CONFIG = {
  not_discussed:     { label: "Not Discussed",    color: "#9CA3AF", bg: "#F3F4F6" },
  in_discussion:     { label: "In Discussion",     color: "#B45309", bg: "#FFFBEB" },
  decision_recorded: { label: "Decision Recorded", color: "#065F46", bg: "#ECFDF5" },
  parked:            { label: "Parked for Later",  color: "#6D28D9", bg: "#F5F3FF" },
};
const STATUS_OPTIONS = ["not_discussed", "in_discussion", "decision_recorded", "parked"];

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

function ActivityRow({ activity, stats, note, draftNote, draftDecision, draftRole, assessmentRoles, saving, onDraftNoteChange, onDraftDecisionChange, onDraftRoleChange, onSave, onToggleFlag, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const gap = stats?.avgGap ?? null;
  const dot = gapColor(gap);
  const isFlagged = note?.flagged;
  const status = note?.status || "not_discussed";
  const statusCfg = STATUS_CONFIG[status];

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(e => !e)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(x => !x); } }}
          className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer"
        >
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dot }} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-800">{activity.name}</span>
            {activity.description && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{activity.description}</p>
            )}
          </div>
        </div>
        <select
          value={status}
          onClick={e => e.stopPropagation()}
          onChange={e => onStatusChange(activity.id, e.target.value)}
          className="text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-[#3366FF] cursor-pointer"
          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <button
          onClick={e => { e.stopPropagation(); onToggleFlag(activity.id); }}
          className={`transition-colors ${isFlagged ? "text-amber-500 hover:text-amber-700" : "text-gray-300 hover:text-amber-400"}`}
          title={isFlagged ? "Remove flag" : "Flag for discussion"}
        >
          <svg className="w-4 h-4" fill={isFlagged ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V5l7-2 4 2 7-2v13l-7 2-4-2-7 2z" />
          </svg>
        </button>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(e => !e)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(x => !x); } }}
          className="shrink-0 flex items-center gap-3 cursor-pointer"
        >
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
          <svg
            className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

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
              Facilitator notes (may be shared with client)
            </label>
            <textarea
              rows={3}
              placeholder="Add notes for the debrief conversation…"
              value={draftNote || ""}
              onChange={e => onDraftNoteChange(activity.id, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          {/* Responsible role */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Responsible role
            </label>
            <select
              value={draftRole || ""}
              onChange={e => onDraftRoleChange(activity.id, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] bg-white"
            >
              <option value="">Select a role…</option>
              {(assessmentRoles || []).map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Team decision and next step
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

function ThemeSection({ group, activities, activityStats, filterLevel, notes, draftNote, draftDecision, draftRole, assessmentRoles, saving, onDraftNoteChange, onDraftDecisionChange, onDraftRoleChange, onSave, onToggleFlag, onStatusChange }) {
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
              <span>✓</span> All activities performing well in this area
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
              <span className="ml-2 text-[#FF3333] font-medium">{criticalCount} need focus</span>
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
                draftRole={draftRole[act.id]}
                assessmentRoles={assessmentRoles}
                saving={saving[act.id]}
                onDraftNoteChange={onDraftNoteChange}
                onDraftDecisionChange={onDraftDecisionChange}
                onDraftRoleChange={onDraftRoleChange}
                onSave={onSave}
                onToggleFlag={onToggleFlag}
                onStatusChange={onStatusChange}
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
  const [draftRole, setDraftRole] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, allNotes, resps] = await Promise.all([
        getAssignedActivities(assessment),
        base44.entities.DiscussionNote.list(),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      const existingNotes = allNotes.filter(n => n.assessment_id === assessment.id);
      setActivities(acts);
      setResponses(resps);
      const noteMap = {};
      for (const n of existingNotes) noteMap[n.activity_id] = n;
      setNotes(noteMap);
      const noteDrafts = {}, decDrafts = {}, roleDrafts = {};
      for (const n of existingNotes) {
        noteDrafts[n.activity_id] = n.note || "";
        decDrafts[n.activity_id] = n.decision || "";
        roleDrafts[n.activity_id] = n.decision_role || "";
      }
      setDraftNote(noteDrafts);
      setDraftDecision(decDrafts);
      setDraftRole(roleDrafts);
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
        decision_role: draftRole[activityId] || "",
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

  const handleStatusChange = async (activityId, newStatus) => {
    const existing = notes[activityId];
    try {
      const saved = existing
        ? await base44.entities.DiscussionNote.update(existing.id, { status: newStatus })
        : await base44.entities.DiscussionNote.create({
            assessment_id: assessment.id,
            activity_id: activityId,
            note: "",
            decision: "",
            decision_role: "",
            flagged: false,
            status: newStatus,
          });
      setNotes(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to update status", e);
    }
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
  const activityStats = computeActivityStats(activities, responses);

  const allGaps = Object.values(activityStats).map(s => s.avgGap).filter(v => v !== null);
  const criticalGaps   = allGaps.filter(g => g >= 2).length;
  const attentionGaps  = allGaps.filter(g => g >= 1 && g < 2).length;
  const onTrackCount   = allGaps.filter(g => g < 1).length;
  const problemCount   = criticalGaps + attentionGaps;

  const flaggedCount  = Object.values(notes).filter(n => n.flagged).length;
  const decidedCount  = Object.values(notes).filter(n => n.decision?.trim()).length;
  const inDiscussionCount = activities.filter(a => (notes[a.id]?.status || "not_discussed") === "in_discussion").length;
  const parkedCount = activities.filter(a => (notes[a.id]?.status || "not_discussed") === "parked").length;

  return (
    <div className="p-8">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm text-gray-500 mb-8">
        <span>
          <span className="font-semibold text-amber-600">{flaggedCount}</span> flagged for discussion
        </span>
        <span>
          <span className="font-semibold text-green-700">{decidedCount}</span> with team decisions
        </span>
        <span>
          <span className="font-semibold" style={{ color: STATUS_CONFIG.in_discussion.color }}>{inDiscussionCount}</span> in discussion
        </span>
        <span>
          <span className="font-semibold" style={{ color: STATUS_CONFIG.parked.color }}>{parkedCount}</span> parked
        </span>
        <span className="text-gray-400">{activities.length} total activities</span>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {[
          { key: "critical",  color: "#FF3333", label: "Immediate attention", count: criticalGaps  },
          { key: "attention", color: "#FFCC00", label: "Worth discussing",   count: attentionGaps },
          { key: "ontrack",   color: "#11CC77", label: "Performing well",    count: onTrackCount  },
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
            ? `Showing ${criticalGaps} ${criticalGaps === 1 ? "activity" : "activities"} needing immediate attention`
            : filterLevel === "attention"
            ? `Showing ${attentionGaps} ${attentionGaps === 1 ? "activity" : "activities"} worth discussing`
            : filterLevel === "ontrack"
            ? `Showing ${onTrackCount} ${onTrackCount === 1 ? "activity" : "activities"} performing well`
            : `Showing ${problemCount} of ${activities.length} activities`}
          {filterLevel !== "all" && (
            <button
              onClick={() => setFilterLevel("all")}
              className="ml-2 text-[#3366FF] hover:text-[#003366] font-medium transition-colors"
            >
              View all activities
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
          draftRole={draftRole}
          assessmentRoles={assessment.roles || []}
          saving={saving}
          onDraftNoteChange={(id, val) => setDraftNote(prev => ({ ...prev, [id]: val }))}
          onDraftDecisionChange={(id, val) => setDraftDecision(prev => ({ ...prev, [id]: val }))}
          onDraftRoleChange={(id, val) => setDraftRole(prev => ({ ...prev, [id]: val }))}
          onSave={handleSave}
          onToggleFlag={handleToggleFlag}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  );
}