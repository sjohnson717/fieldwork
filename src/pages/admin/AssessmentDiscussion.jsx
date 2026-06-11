import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

export default function AssessmentDiscussion({ assessment }) {
  const [activities, setActivities] = useState([]);
  const [notes, setNotes] = useState({}); // activityId -> DiscussionNote
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFacet, setSelectedFacet] = useState("ALL");
  const [expandedId, setExpandedId] = useState(null);
  const [draftNote, setDraftNote] = useState({}); // activityId -> string
  const [draftDecision, setDraftDecision] = useState({}); // activityId -> string
  const [saving, setSaving] = useState({}); // activityId -> bool

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, existingNotes, resps] = await Promise.all([
        base44.entities.Activity.filter({ active: true }, "sort_order"),
        base44.entities.DiscussionNote.filter({ assessment_id: assessment.id }),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      setActivities(acts);
      setResponses(resps);
      const noteMap = {};
      for (const n of existingNotes) {
        noteMap[n.activity_id] = n;
      }
      setNotes(noteMap);
      // Pre-fill drafts from existing notes
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
      let saved;
      if (existing) {
        saved = await base44.entities.DiscussionNote.update(existing.id, payload);
      } else {
        saved = await base44.entities.DiscussionNote.create(payload);
      }
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
      let saved;
      if (existing) {
        saved = await base44.entities.DiscussionNote.update(existing.id, { flagged: newFlagged });
      } else {
        saved = await base44.entities.DiscussionNote.create({
          assessment_id: assessment.id,
          activity_id: activityId,
          note: "",
          decision: "",
          flagged: newFlagged,
        });
      }
      setNotes(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to toggle flag", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const filteredActivities = selectedFacet === "ALL"
    ? activities
    : activities.filter(a => a.facet === selectedFacet);

  const flaggedCount = Object.values(notes).filter(n => n.flagged).length;
  const decidedCount = Object.values(notes).filter(n => n.decision?.trim()).length;

  // Build importance/execution summaries per activity
  const IMPORTANCE_SCORE = { "Not needed": 0, "Nice to have": 1, "Important": 2, "Critical": 3 };
  const EXECUTION_SCORE = { "Not done": 0, "Inconsistent": 1, "Good": 2, "Excellent": 3 };

  const activitySummary = (actId) => {
    const actResps = responses.filter(r => r.activity_id === actId);
    if (actResps.length === 0) return null;
    const impScores = actResps.map(r => IMPORTANCE_SCORE[r.importance]).filter(v => v !== undefined);
    const execScores = actResps.map(r => EXECUTION_SCORE[r.execution]).filter(v => v !== undefined);
    const avgImp = impScores.length ? impScores.reduce((a, b) => a + b, 0) / impScores.length : null;
    const avgExec = execScores.length ? execScores.reduce((a, b) => a + b, 0) / execScores.length : null;
    const gap = avgImp !== null && avgExec !== null ? avgImp - avgExec : null;
    return { avgImp, avgExec, gap, n: actResps.length };
  };

  return (
    <div className="p-8 space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm text-gray-500">
        <span>
          <span className="font-semibold text-amber-600">{flaggedCount}</span> flagged for discussion
        </span>
        <span>
          <span className="font-semibold text-green-700">{decidedCount}</span> with decisions recorded
        </span>
        <span className="text-gray-400">{activities.length} total activities</span>
      </div>

      {/* Facet filter */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap w-fit">
        <button
          onClick={() => setSelectedFacet("ALL")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            selectedFacet === "ALL" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          All
        </button>
        {availableFacets.map(f => (
          <button
            key={f}
            onClick={() => setSelectedFacet(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedFacet === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div className="space-y-2">
        {filteredActivities.map(act => {
          const note = notes[act.id];
          const isExpanded = expandedId === act.id;
          const isFlagged = note?.flagged;
          const hasNote = note?.note?.trim();
          const hasDecision = note?.decision?.trim();
          const summary = activitySummary(act.id);

          return (
            <div
              key={act.id}
              className={`bg-white rounded-xl border transition-all ${
                isFlagged ? "border-amber-300 shadow-amber-50 shadow-sm" : "border-gray-200"
              }`}
            >
              {/* Row header */}
              <div
                className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-xl"
                onClick={() => setExpandedId(isExpanded ? null : act.id)}
              >
                {/* Flag button */}
                <button
                  onClick={e => { e.stopPropagation(); handleToggleFlag(act.id); }}
                  className={`shrink-0 transition-colors ${
                    isFlagged ? "text-amber-500 hover:text-amber-700" : "text-gray-200 hover:text-amber-400"
                  }`}
                  title={isFlagged ? "Remove flag" : "Flag for discussion"}
                >
                  <svg className="w-4 h-4" fill={isFlagged ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V5l7-2 4 2 7-2v13l-7 2-4-2-7 2z" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{act.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{act.facet}</span>
                  </div>
                  {act.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{act.description}</p>
                  )}
                </div>

                {/* Mini stats */}
                {summary && (
                  <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                    <span>n={summary.n}</span>
                    {summary.gap !== null && (
                      <span className={`font-semibold ${
                        summary.gap >= 2 ? "text-red-500" :
                        summary.gap >= 1 ? "text-amber-500" :
                        "text-gray-400"
                      }`}>
                        Δ{summary.gap.toFixed(1)}
                      </span>
                    )}
                  </div>
                )}

                {/* Status pills */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasNote && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400" title="Has note" />
                  )}
                  {hasDecision && (
                    <span className="w-2 h-2 rounded-full bg-green-500" title="Has decision" />
                  )}
                </div>

                {/* Expand chevron */}
                <svg
                  className={`w-4 h-4 text-gray-300 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {/* Response summary */}
                  {summary && (
                    <div className="flex gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5">
                      <span>{summary.n} response{summary.n !== 1 ? "s" : ""}</span>
                      {summary.avgImp !== null && (
                        <span>Importance avg <span className="font-semibold text-indigo-600">{summary.avgImp.toFixed(1)}</span>/3</span>
                      )}
                      {summary.avgExec !== null && (
                        <span>Execution avg <span className="font-semibold text-emerald-600">{summary.avgExec.toFixed(1)}</span>/3</span>
                      )}
                      {summary.gap !== null && (
                        <span>Gap <span className={`font-semibold ${summary.gap >= 1 ? "text-amber-600" : "text-gray-500"}`}>{summary.gap.toFixed(1)}</span></span>
                      )}
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Discussion notes
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Add notes for the debrief conversation…"
                      value={draftNote[act.id] || ""}
                      onChange={e => setDraftNote(prev => ({ ...prev, [act.id]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300"
                    />
                  </div>

                  {/* Decision */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Decision / action
                    </label>
                    <textarea
                      rows={2}
                      placeholder="What was decided or committed to?"
                      value={draftDecision[act.id] || ""}
                      onChange={e => setDraftDecision(prev => ({ ...prev, [act.id]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {hasDecision && (
                        <span className="flex items-center gap-1 text-green-600">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Decision recorded
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleSave(act.id)}
                      disabled={saving[act.id]}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
                    >
                      {saving[act.id] ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
