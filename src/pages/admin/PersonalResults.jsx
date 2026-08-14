import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { listRespondents } from "@/lib/public-assessment";
import { FACET_ORDER, computeActivityStats, fmt as fmtTeam } from "@/lib/scoring";
import {
  PERSONAL_AXES,
  CATEGORIES,
  computeActivityCapability,
  computePersonProfile,
  computeCoverage,
  normalize,
  score,
  heatClass,
  fmt,
  pct,
} from "@/lib/personal-scoring";
import ConfirmDialog from "@/components/ConfirmDialog";
import RespondentPreview from "@/components/RespondentPreview";

const VIEWS = [
  { key: "people", label: "People" },
  { key: "matrix", label: "Matrix" },
  { key: "coverage", label: "Coverage" },
];

// The matrix can show any single axis, or the blend of experience and skills.
const MATRIX_MODES = [
  ...PERSONAL_AXES.map(a => ({ key: a.key, label: a.label })),
  { key: "capability", label: "Capability" },
];

// The facilitator's vocabulary, not the person's. `label`/`hint` are blunt on
// purpose — they are diagnostic notes for someone preparing a coaching
// engagement, and none of these words appear in what the person reads.
function CategoryBadge({ category }) {
  const c = CATEGORIES[category];
  if (!c) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${c.color}`} title={c.hint}>
      {c.label}
    </span>
  );
}

export default function PersonalResults({ assessment }) {
  const [activities, setActivities] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [parent, setParent] = useState(null);
  const [parentResponses, setParentResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("people");
  const [matrixMode, setMatrixMode] = useState("capability");
  const [selectedFacet, setSelectedFacet] = useState("ALL");
  const [selectedRespondentId, setSelectedRespondentId] = useState(null);
  const [removingRespondent, setRemovingRespondent] = useState(null);
  const [previewRespondent, setPreviewRespondent] = useState(null);
  // Same gate as the team page's preview: this is one person's own report.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => setIsSuperAdmin(u?.role === "admin")).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [assessment.id, assessment.parent_assessment_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [acts, resps, ress] = await Promise.all([
        getAssignedActivities(assessment),
        listRespondents(assessment.id),
        base44.entities.Response.filter({ assessment_id: assessment.id }),
      ]);
      setActivities(acts);
      setRespondents(resps);
      setResponses(ress);

      // The parent link is optional, and so is access to it: a facilitator can
      // be invited to the personal assessment without being invited to the
      // team one it points at. Failing to load it drops the cross-analysis
      // rather than the page.
      if (assessment.parent_assessment_id) {
        try {
          const [p, pRes] = await Promise.all([
            base44.entities.Assessment.get(assessment.parent_assessment_id),
            base44.entities.Response.filter({ assessment_id: assessment.parent_assessment_id }),
          ]);
          setParent(p || null);
          setParentResponses(pRes || []);
        } catch (e) {
          console.error("Could not load the linked team assessment", e);
          setParent(null);
          setParentResponses([]);
        }
      } else {
        setParent(null);
        setParentResponses([]);
      }
    } catch (e) {
      console.error("Failed to load personal results", e);
    }
    setLoading(false);
  };

  const handleDeleteRespondent = async (id) => {
    setRemovingRespondent(null);
    try {
      const resps = await base44.entities.Response.filter({ respondent_id: id });
      for (const r of resps) await base44.entities.Response.delete(r.id);
      await base44.entities.Respondent.delete(id);
      setRespondents(prev => prev.filter(r => r.id !== id));
      setResponses(prev => prev.filter(r => r.respondent_id !== id));
    } catch (e) {
      console.error("Failed to delete respondent", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
      </div>
    );
  }

  if (respondents.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-400">No responses collected yet.</div>;
  }

  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));
  const filteredActivities = selectedFacet === "ALL"
    ? activities
    : activities.filter(a => a.facet === selectedFacet);

  const capabilityStats = computeActivityCapability(activities, responses, respondents);
  // Only computed when a parent is actually linked and readable. Activities
  // come from the personal assessment; the ids are shared library ids, so the
  // parent's responses line up against them directly.
  const teamStats = parent ? computeActivityStats(activities, parentResponses) : null;

  const responseMap = {};
  for (const r of responses) {
    if (!responseMap[r.activity_id]) responseMap[r.activity_id] = {};
    responseMap[r.activity_id][r.respondent_id] = r;
  }

  const cellValue = (actId, respId) => {
    const r = responseMap[actId]?.[respId];
    if (!r) return { norm: null, display: "" };
    if (matrixMode === "capability") {
      const parts = [normalize("experience", r.experience), normalize("skills", r.skills)]
        .filter(v => v !== null);
      if (parts.length === 0) return { norm: null, display: "" };
      const norm = parts.reduce((a, b) => a + b, 0) / parts.length;
      return { norm, display: pct(norm) };
    }
    const norm = normalize(matrixMode, r[matrixMode]);
    const raw = score(matrixMode, r[matrixMode]);
    return { norm, display: raw === null ? "" : String(raw) };
  };

  const completedCount = respondents.filter(r => r.status === "completed").length;
  const answeredIds = new Set(responses.map(r => r.respondent_id));

  // A personal profile stays editable after the assessment closes, by design —
  // it belongs to the person, not to the engagement. The cost is that the
  // aggregate can shift under a report already delivered, so surface it rather
  // than let it be discovered in the room.
  const revisedAfterClose = assessment.closed_date
    ? [...new Set(
        responses
          .filter(r => r.updated_date && r.updated_date > assessment.closed_date)
          .map(r => r.respondent_id)
      )].length
    : 0;

  return (
    <div className="p-8 space-y-8">

      {/* Respondents */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Respondents</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {respondents.length} total · {completedCount} completed · {respondents.filter(r => !answeredIds.has(r.id)).length} empty
            </p>
          </div>
          <button onClick={loadData} className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
            Refresh
          </button>
        </div>
        {revisedAfterClose > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            {revisedAfterClose} {revisedAfterClose === 1 ? "person has" : "people have"} changed answers since this
            assessment closed on {new Date(assessment.closed_date).toLocaleDateString()}. The figures below include
            those edits, so they may differ from anything you've already presented.
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 font-medium w-36">Name</th>
              <th className="text-left pb-2 font-medium w-28">Title</th>
              <th className="text-left pb-2 font-medium">Status</th>
              <th className="text-left pb-2 font-medium">Capability</th>
              <th className="text-left pb-2 font-medium">Interest</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {respondents.map(r => {
              const profile = computePersonProfile(activities, responses, r.id);
              const isEmpty = profile.answeredCount === 0;
              return (
                <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${isEmpty ? "bg-red-50/40" : ""}`}>
                  <td className="py-2.5 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 text-gray-500">{r.title}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs font-semibold text-gray-600">{pct(profile.avgCapability)}</td>
                  <td className="py-2.5 text-xs font-semibold text-gray-600">{pct(profile.avgInterest)}</td>
                  <td className="py-2.5 pl-2 text-right flex items-center justify-end gap-3">
                    {isSuperAdmin && !isEmpty && (
                      <button
                        onClick={() => setPreviewRespondent(r)}
                        title="See this person's own profile report, read-only"
                        className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        Preview
                      </button>
                    )}
                    <button
                      onClick={() => setRemovingRespondent(r)}
                      className={`text-xs transition-colors ${isEmpty ? "text-red-300 hover:text-red-500 font-medium" : "text-gray-300 hover:text-red-400"}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === v.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view === "matrix" && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {MATRIX_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMatrixMode(m.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  matrixMode === m.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {view !== "people" && (
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
        )}
      </div>

      {/* People — one person's profile, bucketed */}
      {view === "people" && (() => {
        const activeId = selectedRespondentId || respondents[0]?.id;
        const person = respondents.find(r => r.id === activeId);
        const profile = computePersonProfile(activities, responses, activeId);

        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-600">Person:</label>
              <select
                value={activeId || ""}
                onChange={e => setSelectedRespondentId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
              >
                {respondents.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {person?.title && <span className="text-sm text-gray-400">{person.title}</span>}
            </div>

            {profile.answeredCount === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                {person?.name || "This person"} hasn't answered anything yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(CATEGORIES).map(([key, q]) => {
                  const rows = profile.buckets[key];
                  return (
                    <section key={key} className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-baseline justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{q.label}</h3>
                        <span className="text-xs text-gray-400">{rows.length}</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">{q.hint}</p>
                      {rows.length === 0 ? (
                        <p className="text-xs text-gray-300 italic">Nothing here.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {rows.map(row => (
                            <li key={row.activity.id} className="flex items-center gap-2 text-sm">
                              <span className="flex-1 text-gray-700 leading-snug">{row.activity.name}</span>
                              <span className="text-[10px] text-gray-400 shrink-0">{row.activity.facet}</span>
                              <span className="text-[11px] text-gray-500 shrink-0 tabular-nums" title="Capability · Interest">
                                {pct(row.capability)} · {pct(row.interest)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            {/* Every answer, for the person's own development conversation */}
            {profile.answeredCount > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="text-sm w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">Activity</th>
                      {PERSONAL_AXES.map(a => (
                        <th key={a.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{a.label}</th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.rows.map((row, idx) => (
                      <tr key={row.activity.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-4 py-3 border-r border-gray-100">
                          <div className="font-medium text-gray-800">{row.activity.name}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{row.activity.facet}</div>
                        </td>
                        {PERSONAL_AXES.map(a => (
                          <td key={a.key} className="px-4 py-3 text-sm text-gray-700">
                            {row.response?.[a.key] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        <td className="px-4 py-3"><CategoryBadge category={row.category} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Matrix — activity × person for one axis */}
      {view === "matrix" && (
        <>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="font-medium text-gray-700">
              {matrixMode === "capability"
                ? "Capability = experience and skills combined, as a percentage of the scale"
                : `${MATRIX_MODES.find(m => m.key === matrixMode)?.label} score`}
            </span>
            <div className="flex gap-1.5 items-center">
              <span className="w-4 h-4 rounded bg-[#e6ecff] inline-block" />Low →
              <span className="w-4 h-4 rounded bg-[#3366FF] inline-block" />High
            </div>
          </div>

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
                  <th className="px-3 py-3 text-center border-b border-gray-100 font-semibold text-gray-700 bg-gray-50">Avg</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((act, idx) => {
                  const stats = capabilityStats[act.id];
                  const avgNorm = matrixMode === "capability"
                    ? stats?.avgCapability ?? null
                    : (() => {
                        // Re-normalise the raw axis average so the Avg column
                        // is shaded on the same 0–1 ramp as the cells beside it.
                        const raw = stats?.axisAvg?.[matrixMode];
                        if (raw === null || raw === undefined) return null;
                        const values = Object.values(PERSONAL_AXES.find(a => a.key === matrixMode).scores);
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        return (raw - min) / (max - min);
                      })();
                  const avgDisplay = matrixMode === "capability"
                    ? pct(stats?.avgCapability)
                    : fmt(stats?.axisAvg?.[matrixMode]);
                  return (
                    <tr key={act.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                      <td className="px-4 py-2 sticky left-0 bg-inherit z-10 border-r border-gray-100">
                        <div className="font-medium text-gray-800 leading-snug">{act.name}</div>
                        <div className="text-gray-400 text-[10px] mt-0.5">{act.facet}</div>
                      </td>
                      {respondents.map(r => {
                        const { norm, display } = cellValue(act.id, r.id);
                        return (
                          <td key={r.id} className="px-1 py-1 text-center">
                            <div className={`w-9 h-8 mx-auto rounded flex items-center justify-center text-[11px] font-semibold ${heatClass(norm)}`}>
                              {display}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center bg-gray-50 border-l border-gray-100">
                        <div className={`w-11 h-8 mx-auto rounded flex items-center justify-center text-[11px] font-bold ${heatClass(avgNorm)}`}>
                          {avgDisplay}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Coverage — who can actually do each activity */}
      {view === "coverage" && (() => {
        const rows = computeCoverage(filteredActivities, capabilityStats, teamStats);
        const uncovered = rows.filter(r => !r.covered);
        return (
          <div className="space-y-6">
            {!assessment.parent_assessment_id && (
              <p className="text-xs text-gray-400">
                Link this to a team assessment on the Overview tab to see capability against what the team said matters.
              </p>
            )}
            {assessment.parent_assessment_id && !parent && (
              <p className="text-xs text-amber-600">
                The linked team assessment couldn't be loaded — you may not have access to it. Showing capability only.
              </p>
            )}

            {uncovered.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Coverage gaps</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Nobody who answered rates themselves as capable here{parent ? ", ordered by how much the team says it matters" : ""}.
                </p>
                <ul className="space-y-2">
                  {uncovered.map(row => (
                    <li key={row.activity.id} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 text-gray-700">{row.activity.name}</span>
                      <span className="text-xs text-gray-400">{row.activity.facet}</span>
                      {parent && row.avgImp !== null && (
                        <span className="text-xs text-gray-500">Imp <span className="font-semibold text-[#3366FF]">{fmtTeam(row.avgImp)}</span></span>
                      )}
                      <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2 py-0.5 rounded-full">
                        best {pct(row.bestFit?.capability ?? null)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">Activity</th>
                    {parent && <>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Importance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Gap</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team's owner</th>
                    </>}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Best fit</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg capability</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg interest</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.activity.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-3 border-r border-gray-100">
                        <div className="font-medium text-gray-800">{row.activity.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{row.activity.facet}</div>
                      </td>
                      {parent && <>
                        <td className="px-4 py-3 text-center text-xs text-gray-600">{fmtTeam(row.avgImp)}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-600">{fmtTeam(row.avgGap)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{row.topOwner || <span className="text-gray-300">—</span>}</td>
                      </>}
                      <td className="px-4 py-3">
                        {row.bestFit ? (
                          <span className="text-sm text-gray-700">
                            {row.bestFit.name || "Unnamed"}
                            <span className={`ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              row.covered ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                            }`}>
                              {pct(row.bestFit.capability)}
                            </span>
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">{pct(row.avgCapability)}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">{pct(row.avgInterest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {previewRespondent && isSuperAdmin && (
        <RespondentPreview
          assessment={assessment}
          respondent={previewRespondent}
          activities={activities}
          responses={responses}
          onClose={() => setPreviewRespondent(null)}
        />
      )}

      <ConfirmDialog
        open={!!removingRespondent}
        destructive
        title="Remove this respondent?"
        message={`${removingRespondent?.name || "This respondent"} and all of their responses will be permanently removed. This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={() => handleDeleteRespondent(removingRespondent.id)}
        onCancel={() => setRemovingRespondent(null)}
      />
    </div>
  );
}
