import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { getTeamLeaderView } from "@/lib/public-assessment";
import { FACET_ORDER, FACET_SUBTITLES } from "@/lib/scoring";
import { usePrintSafeUrl } from "@/lib/print-safe-url";

const PGL_LOGO = "https://static.wixstatic.com/media/739bca_d49790dff653441fae7d036110019dc2~mv2.png";

// "In progress" means they have actually answered something. Signing in and
// stopping is a different, useful signal — it says the link works and they
// haven't engaged, rather than that they're partway through.
function statusBadge(status, answerCount = 0) {
  if (status === "completed") {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
        Completed
      </span>
    );
  }
  if (answerCount > 0) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
        In progress
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
      Started
    </span>
  );
}

const typeLabel = (type) => (type === "personal" ? "Personal assessment" : "Gap analysis");

const typeBlurb = (type) =>
  type === "personal"
    ? "Each person rates their own experience, skills and interest in each activity."
    : "The team rates how important each activity is and how well it's being done today.";

// Received = they pressed submit. Partial answers are visible in the roster
// but are not a response the consultant can score yet, so the headline number
// counts completions only.
function receivedCount(rows) {
  return rows.filter(r => r.status === "completed").length;
}

function RosterTable({ rows, linkFor }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        No one has started yet. Send the link above to your team.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
          <th className="text-left px-4 py-3 font-medium">Name</th>
          <th className="text-left px-4 py-3 font-medium w-28">Status</th>
          {linkFor && <th className="px-4 py-3 w-24" />}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
            <td className="px-4 py-3 font-medium text-gray-800">
              {r.name}
              {r.title && <span className="text-xs text-gray-400 ml-2">{r.title}</span>}
            </td>
            <td className="px-4 py-3">{statusBadge(r.status, r.answer_count)}</td>
            {linkFor && (
              <td className="px-4 py-3 text-right">
                <CopyButton text={linkFor(r)} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-xs font-medium text-[#3366FF] hover:text-[#2952CC] border border-[#a3b8ff] hover:border-[#4d80ff] px-2 py-1 rounded-lg transition-colors"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

export default function TeamLeaderPage() {
  const { token } = useParams();
  // The URL is the credential on this page; keep it out of the printed header.
  usePrintSafeUrl();
  const [assessment, setAssessment] = useState(null);
  const [respondents, setRespondents] = useState([]);
  // Assessments paired with this one — typically the personal assessment the
  // team members answer while the leaders answer the gap analysis.
  const [linked, setLinked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Activities under review + this team leader's flags, keyed by activity_id
  const [activities, setActivities] = useState([]);
  const [flags, setFlags] = useState({});
  const [draftNotes, setDraftNotes] = useState({});
  const [savingFlagId, setSavingFlagId] = useState(null);
  const [flagError, setFlagError] = useState("");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);


  useEffect(() => {
    if (token) loadPage();
  }, [token]);

  useEffect(() => { document.title = "Team | Quartz Assessment"; }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      // Resolved server-side; the team token is a credential, not something
      // to be read off a listing of every assessment.
      const view = await getTeamLeaderView(token);
      if (!view?.assessment) {
        setError("Team link not found. Please check your link.");
        setLoading(false);
        return;
      }
      const found = view.assessment;
      setAssessment(found);
      const [acts, flagList] = await Promise.all([
        getAssignedActivities(found),
        base44.entities.TeamLeaderFlag.filter({ assessment_id: found.id }),
      ]);
      setRespondents(view.respondents || []);
      setLinked(view.linked || []);
      setActivities(acts);
      const flagMap = {}, noteMap = {};
      for (const f of flagList) {
        flagMap[f.activity_id] = f;
        noteMap[f.activity_id] = f.note || "";
      }
      setFlags(flagMap);
      setDraftNotes(noteMap);
    } catch (e) {
      setError("Something went wrong loading this page.");
    }
    setLoading(false);
  };

  // Flags are advisory: the team leader signals which activities are worth
  // revisiting, and their consultant decides whether to change the set.
  const saveFlag = async (activityId, { flagged, note }) => {
    setSavingFlagId(activityId);
    setFlagError("");
    try {
      const existing = flags[activityId];
      const payload = {
        assessment_id: assessment.id,
        activity_id: activityId,
        flagged,
        note: note || "",
      };
      const saved = existing
        ? await base44.entities.TeamLeaderFlag.update(existing.id, payload)
        : await base44.entities.TeamLeaderFlag.create(payload);
      setFlags(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to save flag", e);
      setFlagError(e?.message || "Couldn't save that. Please try again.");
    }
    setSavingFlagId(null);
  };

  const handleToggleFlag = (activityId) => {
    const isFlagged = !!flags[activityId]?.flagged;
    saveFlag(activityId, { flagged: !isFlagged, note: draftNotes[activityId] });
  };

  const handleSaveNote = (activityId) => {
    saveFlag(activityId, { flagged: true, note: draftNotes[activityId] });
  };

  const personalLink = (respondentToken) =>
    `${window.location.origin}/assess?code=${assessment.access_code}&t=${respondentToken}`;

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

  // Below the guards above, so `assessment` is guaranteed to be loaded —
  // these read its fields eagerly on every render.
  const teamAssessmentLink = `${window.location.origin}/assess?code=${assessment.access_code}`;
  const thisPageLink = `${window.location.origin}/team/${token}`;

  const flaggedCount = activities.filter(a => flags[a.id]?.flagged).length;
  // Falls back to the full list if the last flag is removed while filtered,
  // so the view never strands on an empty screen with no toggle to escape it.
  const visibleActivities =
    showFlaggedOnly && flaggedCount > 0
      ? activities.filter(a => flags[a.id]?.flagged)
      : activities;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={PGL_LOGO} alt="Product Growth Leaders" className="h-8 object-contain" />
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Team Management</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assessment.company_name || assessment.title}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {linked.length > 0
              ? "Manage your team's participation across both assessments."
              : "Manage your team's participation in this assessment."}
          </p>
        </div>

        {/* Responses received. Only shown when there is more than one
            assessment to track — with a single roster the table below already
            says everything this would. */}
        {linked.length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { id: assessment.id, type: assessment.assessment_type, rows: respondents },
              ...linked.map(l => ({ id: l.id, type: l.type, rows: l.respondents })),
            ].map(entry => (
              <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{typeLabel(entry.type)}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {receivedCount(entry.rows)}
                  <span className="text-base font-medium text-gray-400"> / {entry.rows.length}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {entry.rows.length === 0
                    ? "Nobody has started yet"
                    : `${receivedCount(entry.rows)} of ${entry.rows.length} responses received`}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* Sharing */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">
              {linked.length > 0 ? `Send this to your team · ${typeLabel(assessment.assessment_type)}` : "Send this to your team"}
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              One link for everyone. Each person enters their name and job title when they open it,
              and appears below as soon as they do.
              {linked.length > 0 && " The paired assessment has its own link, further down."}
            </p>
            <div className="flex items-center gap-3 bg-[#eef2ff] border border-[#a3b8ff] rounded-lg px-4 py-3">
              <p className="text-xs text-[#2952CC] font-mono flex-1 truncate">{teamAssessmentLink}</p>
              <CopyButton text={teamAssessmentLink} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Add a co-leader</h2>
            <p className="text-xs text-gray-400 mb-3">
              Share this page with someone else who should watch the team's progress. Anyone with
              this link can see it, so treat it as confidential.
            </p>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 font-mono flex-1 truncate">{thisPageLink}</p>
              <CopyButton text={thisPageLink} />
            </div>
          </div>
        </section>

        {/* Roster */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {linked.length > 0 ? `Participants · ${typeLabel(assessment.assessment_type)}` : "Participants"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {respondents.length} total · {receivedCount(respondents)} received
            </p>
          </div>
          {/* No per-person links on a personal assessment — see the token
              handling in publicAssessment. The server already withholds the
              tokens, so this is presentation rather than protection: without
              it the column would render a row of buttons producing links with
              "undefined" in them. */}
          <RosterTable
            rows={respondents}
            linkFor={assessment.assessment_type === "personal" ? null : (r => personalLink(r.token))}
          />
        </section>

        {/* Paired assessments. Each has its own access code, so the leader
            gets a second broadcast link here rather than a second dashboard.
            No per-person links: those reopen and edit someone's answers, which
            is not what "has it arrived?" needs. */}
        {linked.map(l => (
          <section key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                  Participants · {typeLabel(l.type)}
                </h2>
                {l.status === "closed" && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                    Closed
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {l.respondents.length} total · {receivedCount(l.respondents)} received. {typeBlurb(l.type)}
              </p>
            </div>

            {l.status !== "closed" && (
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Send this link to everyone taking it.</p>
                <div className="flex items-center gap-3 bg-[#eef2ff] border border-[#a3b8ff] rounded-lg px-4 py-3">
                  <p className="text-xs text-[#2952CC] font-mono flex-1 truncate">
                    {`${window.location.origin}/assess?code=${l.access_code}`}
                  </p>
                  <CopyButton text={`${window.location.origin}/assess?code=${l.access_code}`} />
                </div>
              </div>
            )}

            <RosterTable rows={l.respondents} />
          </section>
        ))}

        {/* Activities under review */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Activities in this assessment</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {activities.length} {activities.length === 1 ? "activity" : "activities"} your team will rate.
                Flag any you'd like to discuss with your consultant — they'll decide whether to adjust the set.
              </p>
            </div>
            {flaggedCount > 0 && (
              <div className="flex shrink-0 rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setShowFlaggedOnly(false)}
                  className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                    showFlaggedOnly ? "bg-white text-gray-500 hover:bg-gray-50" : "bg-[#3366FF] text-white"
                  }`}
                >
                  All {activities.length}
                </button>
                <button
                  onClick={() => setShowFlaggedOnly(true)}
                  className={`text-xs font-medium px-3 py-1.5 border-l border-gray-200 transition-colors ${
                    showFlaggedOnly ? "bg-[#3366FF] text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  Flagged {flaggedCount}
                </button>
              </div>
            )}
          </div>

          {flagError && <p className="text-xs text-red-500 px-6 py-3">{flagError}</p>}

          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No activities have been selected yet.</p>
          ) : (
            <div>
              {FACET_ORDER.map(facet => {
                const items = visibleActivities.filter(a => a.facet === facet);
                if (items.length === 0) return null;
                return (
                  <div key={facet}>
                    <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-bold uppercase tracking-widest text-[#3366FF]">{facet}</span>
                      <span className="text-xs text-gray-400 ml-2">{FACET_SUBTITLES[facet]}</span>
                    </div>
                    {items.map(activity => {
                      const isFlagged = !!flags[activity.id]?.flagged;
                      const isSaving = savingFlagId === activity.id;
                      const noteDraft = draftNotes[activity.id] ?? "";
                      const savedNote = flags[activity.id]?.note || "";
                      return (
                        <div key={activity.id} className="px-6 py-4 border-b border-gray-50 last:border-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{activity.name}</p>
                              {activity.description && (
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{activity.description}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleToggleFlag(activity.id)}
                              disabled={isSaving}
                              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                                isFlagged
                                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                              }`}
                            >
                              {isSaving ? "Saving…" : isFlagged ? "✓ Flagged" : "Flag for discussion"}
                            </button>
                          </div>

                          {isFlagged && (
                            <div className="mt-3">
                              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                Why? (optional — your consultant will see this)
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={noteDraft}
                                  onChange={e => setDraftNotes(prev => ({ ...prev, [activity.id]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && handleSaveNote(activity.id)}
                                  placeholder="e.g. the team is already strong here"
                                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                                />
                                <button
                                  onClick={() => handleSaveNote(activity.id)}
                                  disabled={isSaving || noteDraft === savedNote}
                                  className="shrink-0 text-xs font-medium text-[#3366FF] hover:text-[#2952CC] disabled:opacity-40 px-3 transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}