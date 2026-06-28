import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

const IMPORTANCE_SCORE = { "Not needed": 0, "Nice to have": 1, "Important": 2, "Critical": 3 };
const EXECUTION_SCORE = { "Not done": 0, "Inconsistent": 1, "Good": 2, "Excellent": 3 };

// Gap = high importance, low execution = most actionable
const gapScore = (imp, exec) => {
  const i = IMPORTANCE_SCORE[imp] ?? -1;
  const e = EXECUTION_SCORE[exec] ?? -1;
  if (i < 0 || e < 0) return null;
  return i - e;
};

const importanceColor = (avg) => {
  if (avg === null) return "bg-gray-50 text-gray-300";
  if (avg >= 2.5) return "bg-[#3366FF] text-white";
  if (avg >= 1.5) return "bg-[#4d80ff] text-[#1a2e7a]";
  if (avg >= 0.5) return "bg-[#dce5ff] text-[#2952CC]";
  return "bg-gray-100 text-gray-500";
};

const executionColor = (avg) => {
  if (avg === null) return "bg-gray-50 text-gray-300";
  if (avg >= 2.5) return "bg-emerald-600 text-white";
  if (avg >= 1.5) return "bg-emerald-300 text-emerald-900";
  if (avg >= 0.5) return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-500";
};

const gapColor = (gap) => {
  if (gap === null) return "bg-gray-50 text-gray-300";
  if (gap >= 2) return "bg-gray-900 text-white";
  if (gap >= 1) return "bg-gray-500 text-white";
  if (gap >= 0) return "bg-gray-200 text-gray-700";
  return "bg-gray-50 text-gray-300";
};

const avg = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

const fmt = (n) => n === null ? "—" : n.toFixed(1);

export default function AssessmentResults({ assessment }) {
  const [activities, setActivities] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("summary"); // summary | importance | execution | gap
  const [selectedFacet, setSelectedFacet] = useState("ALL");
  const [showGapHelp, setShowGapHelp] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedRespondentId, setSelectedRespondentId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setIsSuperAdmin(u?.role === "admin")).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, resps, ress] = await Promise.all([
        getAssignedActivities(assessment),
        base44.entities.Respondent.filter({ assessment_id: assessment.id }),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      setActivities(acts);
      setRespondents(resps);
      setResponses(ress);
    } catch (e) {
      console.error("Failed to load results", e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
      </div>
    );
  }

  if (respondents.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">No responses collected yet.</div>
    );
  }

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const filteredActivities = selectedFacet === "ALL"
    ? activities
    : activities.filter(a => a.facet === selectedFacet);

  // Build a lookup: activityId -> respondentId -> response
  const responseMap = {};
  for (const r of responses) {
    if (!responseMap[r.activity_id]) responseMap[r.activity_id] = {};
    responseMap[r.activity_id][r.respondent_id] = r;
  }

  // Aggregate per activity
  const activityStats = activities.map(act => {
    const actResponses = responses.filter(r => r.activity_id === act.id);
    const importanceScores = actResponses
      .map(r => IMPORTANCE_SCORE[r.importance])
      .filter(v => v !== undefined);
    const executionScores = actResponses
      .map(r => EXECUTION_SCORE[r.execution])
      .filter(v => v !== undefined);
    const avgImp = avg(importanceScores);
    const avgExec = avg(executionScores);
    const gaps = actResponses
      .map(r => gapScore(r.importance, r.execution))
      .filter(v => v !== null);
    const avgGap = avg(gaps);
    return { ...act, avgImp, avgExec, avgGap, n: actResponses.length };
  });

  // Top gaps for summary table
  const sortedByGap = [...activityStats]
    .filter(a => a.avgGap !== null)
    .sort((a, b) => (b.avgGap ?? 0) - (a.avgGap ?? 0))
    .slice(0, 10);

  const getCellValue = (actId, respId) => {
    const r = responseMap[actId]?.[respId];
    if (!r) return null;
    if (view === "importance") return IMPORTANCE_SCORE[r.importance] ?? null;
    if (view === "execution") return EXECUTION_SCORE[r.execution] ?? null;
    if (view === "gap") return gapScore(r.importance, r.execution);
    return null;
  };

  const getCellColor = (val) => {
    if (val === null) return "bg-gray-50";
    if (view === "importance") return importanceColor(val);
    if (view === "execution") return executionColor(val);
    if (view === "gap") return gapColor(val);
    return "bg-gray-100";
  };

  const getAvgColor = (act) => {
    if (view === "importance") return importanceColor(act.avgImp);
    if (view === "execution") return executionColor(act.avgExec);
    if (view === "gap") return gapColor(act.avgGap);
    return "bg-gray-100";
  };

  const getAvgVal = (act) => {
    if (view === "importance") return fmt(act.avgImp);
    if (view === "execution") return fmt(act.avgExec);
    if (view === "gap") return fmt(act.avgGap);
    return "—";
  };

  return (
    <div className="p-8 space-y-8">

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {["summary", "importance", "execution", "gap"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`relative px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                view === v ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v === "gap" ? (
                <span className="flex items-center">
                  Gap (Priority)
                  <span
                    className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-xs font-bold inline-flex items-center justify-center ml-1 hover:bg-gray-300 cursor-pointer"
                    onClick={e => { e.stopPropagation(); setShowGapHelp(s => !s); }}
                  >?</span>
                  {showGapHelp && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowGapHelp(false)} />
                      <div className="absolute top-8 left-0 z-20 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left text-xs text-gray-600 font-normal leading-relaxed normal-case">
                        Gap = Importance score minus Execution score. A high gap means the team considers this activity important but rates current execution as low — making it the highest coaching priority. Scores range from 0 (no gap) to 3 (maximum gap).
                      </div>
                    </>
                  )}
                </span>
              ) : v === "summary" ? "Summary" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          {isSuperAdmin && (
            <button
              onClick={() => setView("individual")}
              className={`relative px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                view === "individual" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Individual Answers
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
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
      </div>

      {/* Summary Table */}
      {view === "summary" && (() => {
        // Build ownership consensus per activity
        const ownershipMap = {};
        for (const act of activities) {
          const actResponses = responses.filter(r => r.activity_id === act.id && r.suggested_owner);
          if (actResponses.length === 0) { ownershipMap[act.id] = null; continue; }
          const tally = {};
          for (const r of actResponses) tally[r.suggested_owner] = (tally[r.suggested_owner] || 0) + 1;
          const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
          const [topOwner, topCount] = sorted[0];
          const pct = Math.round((topCount / actResponses.length) * 100);
          const breakdown = sorted.map(([role, count]) => `${role} (${count})`).join(", ");
          ownershipMap[act.id] = { topOwner, pct, breakdown, total: actResponses.length };
        }

        const summaryRows = [...activityStats]
          .filter(a => a.avgGap !== null)
          .sort((a, b) => (b.avgGap ?? 0) - (a.avgGap ?? 0));

        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">Activity</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Importance</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Execution</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap ↓</th>
                  {assessment.roles?.length > 0 && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Owner</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((act, idx) => {
                  const ownership = ownershipMap[act.id];
                  const hasConflict = ownership && ownership.pct < 60;
                  return (
                    <tr key={act.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-3 border-r border-gray-100">
                        <div className="font-medium text-gray-800">{act.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{act.facet}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-xs font-bold ${importanceColor(act.avgImp)}`}>
                          {fmt(act.avgImp)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-xs font-bold ${executionColor(act.avgExec)}`}>
                          {fmt(act.avgExec)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-xs font-bold ${gapColor(act.avgGap)}`}>
                          {fmt(act.avgGap)}
                        </span>
                      </td>
                      {assessment.roles?.length > 0 && (
                        <td className="px-4 py-3">
                          {ownership ? (
                            <div>
                              <span className="text-sm text-gray-700 font-medium">
                                {hasConflict && <span title="Low consensus" className="mr-1">⚠</span>}
                                {ownership.topOwner}
                              </span>
                              <div className="text-[10px] text-gray-400 mt-0.5">{ownership.breakdown}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {view !== "summary" && view !== "individual" && <>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">
          {view === "gap" ? "Gap = Importance − Execution (higher = more urgent)" : `0 = lowest · 3 = highest`}
        </span>
        {view === "importance" && (
          <div className="flex gap-1.5 items-center">
            <span className="w-4 h-4 rounded bg-[#dce5ff] inline-block" />Not needed →
            <span className="w-4 h-4 rounded bg-[#3366FF] inline-block" />Critical
          </div>
        )}
        {view === "execution" && (
          <div className="flex gap-1.5 items-center">
            <span className="w-4 h-4 rounded bg-emerald-100 inline-block" />Not done →
            <span className="w-4 h-4 rounded bg-emerald-600 inline-block" />Excellent
          </div>
        )}
        {view === "gap" && (
          <div className="flex gap-1.5 items-center">
            <span className="w-4 h-4 rounded bg-gray-200 inline-block" />No gap →
            <span className="w-4 h-4 rounded bg-gray-500 inline-block" />Moderate →
            <span className="w-4 h-4 rounded bg-gray-900 inline-block" />High priority
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
...
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium border-b border-gray-100 w-64 sticky left-0 bg-white z-10">
                Activity
              </th>
              {respondents.map(r => (
                <th key={r.id} className="px-2 py-3 text-center border-b border-gray-100 font-medium text-gray-500 max-w-[60px]">
                  <div className="truncate w-14 mx-auto" title={r.name}>{r.name.split(" ")[0]}</div>
                </th>
              ))}
              <th className="px-3 py-3 text-center border-b border-gray-100 font-semibold text-gray-700 bg-gray-50">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredActivities.map((act, idx) => {
              const stats = activityStats.find(a => a.id === act.id);
              return (
                <tr key={act.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                  <td className="px-4 py-2 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                    <div className="font-medium text-gray-800 leading-snug">{act.name}</div>
                    <div className="text-gray-400 text-[10px] mt-0.5">{act.facet}</div>
                  </td>
                  {respondents.map(r => {
                    const val = getCellValue(act.id, r.id);
                    return (
                      <td key={r.id} className="px-1 py-1 text-center">
                        <div className={`w-8 h-8 mx-auto rounded flex items-center justify-center text-xs font-semibold ${getCellColor(val)}`}>
                          {val !== null ? val : ""}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center bg-gray-50 border-l border-gray-100">
                    <div className={`w-10 h-8 mx-auto rounded flex items-center justify-center text-xs font-bold ${getAvgColor(stats)}`}>
                      {getAvgVal(stats)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top priorities summary */}
      {view === "gap" && sortedByGap.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Top improvement opportunities</h3>
          <ol className="space-y-2">
            {sortedByGap.map((act, i) => (
              <li key={act.id} className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{act.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{act.facet}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Imp <span className="font-semibold text-[#3366FF]">{fmt(act.avgImp)}</span></span>
                  <span>Exec <span className="font-semibold text-emerald-600">{fmt(act.avgExec)}</span></span>
                  <span className={`font-bold px-2 py-0.5 rounded-full ${gapColor(act.avgGap)}`}>
                    Δ {fmt(act.avgGap)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Owner suggestions */}
      {assessment.roles?.length > 0 && (() => {
        const ownerTally = {};
        for (const act of activities) {
          const actResponses = responses.filter(r => r.activity_id === act.id && r.suggested_owner);
          if (actResponses.length === 0) continue;
          const tally = {};
          for (const r of actResponses) {
            tally[r.suggested_owner] = (tally[r.suggested_owner] || 0) + 1;
          }
          const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
          ownerTally[act.id] = { activity: act, top: top[0], count: top[1], total: actResponses.length };
        }
        const items = Object.values(ownerTally).filter(Boolean);
        if (items.length === 0) return null;
        return (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Suggested ownership</h3>
            <div className="space-y-2">
              {items.map(({ activity: act, top, count, total }) => (
                <div key={act.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-gray-700">{act.name}</span>
                  <span className="text-xs text-gray-400">{act.facet}</span>
                  <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-full">
                    {top} ({count}/{total})
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}
      </>}

      {view === "individual" && isSuperAdmin && (() => {
        const activeRespondentId = selectedRespondentId || respondents[0]?.id;
        const selectedResp = respondents.find(r => r.id === activeRespondentId);
        return (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-medium text-gray-600">Respondent:</label>
              <select
                value={activeRespondentId || ""}
                onChange={e => setSelectedRespondentId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
              >
                {respondents.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">Activity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Importance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Execution</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((act, idx) => {
                    const resp = responseMap[act.id]?.[activeRespondentId];
                    return (
                      <tr key={act.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-3 border-r border-gray-100">
                          <div className="font-medium text-gray-800">{act.name}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{act.facet}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{resp?.importance || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{resp?.execution || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{resp?.suggested_owner || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}