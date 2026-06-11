import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const FACET_ORDER = ["LEARN", "DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

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
  if (avg >= 2.5) return "bg-indigo-600 text-white";
  if (avg >= 1.5) return "bg-indigo-300 text-indigo-900";
  if (avg >= 0.5) return "bg-indigo-100 text-indigo-700";
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
  if (gap >= 2) return "bg-red-500 text-white";
  if (gap >= 1) return "bg-amber-400 text-amber-900";
  if (gap >= 0) return "bg-gray-100 text-gray-600";
  return "bg-gray-100 text-gray-400";
};

const avg = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

const fmt = (n) => n === null ? "—" : n.toFixed(1);

export default function AssessmentResults({ assessment }) {
  const [activities, setActivities] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("importance"); // importance | execution | gap
  const [selectedFacet, setSelectedFacet] = useState("ALL");

  useEffect(() => {
    loadData();
  }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, resps, ress] = await Promise.all([
        base44.entities.Activity.filter({ active: true }, "sort_order"),
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
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
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
          {["importance", "execution", "gap"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                view === v ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v === "gap" ? "Gap (Priority)" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">
          {view === "gap" ? "Gap = Importance − Execution (higher = more urgent)" : `0 = lowest · 3 = highest`}
        </span>
        {view === "importance" && (
          <div className="flex gap-1.5 items-center">
            <span className="w-4 h-4 rounded bg-indigo-100 inline-block" />Not needed →
            <span className="w-4 h-4 rounded bg-indigo-600 inline-block" />Critical
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
            <span className="w-4 h-4 rounded bg-gray-100 inline-block" />No gap →
            <span className="w-4 h-4 rounded bg-amber-400 inline-block" />Moderate →
            <span className="w-4 h-4 rounded bg-red-500 inline-block" />Critical gap
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
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
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Top priorities by gap</h3>
          <ol className="space-y-2">
            {sortedByGap.map((act, i) => (
              <li key={act.id} className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{act.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{act.facet}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Imp <span className="font-semibold text-indigo-600">{fmt(act.avgImp)}</span></span>
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
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Ownership suggestions</h3>
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
    </div>
  );
}
