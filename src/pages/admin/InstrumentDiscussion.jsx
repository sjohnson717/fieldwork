import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { loadResultsData } from "@/lib/respondents";
import { loadInstrument, orderQuestions } from "@/lib/instruments";
import { distributionFor, agendaOrder } from "@/lib/instrument-scoring";
import { Distribution, Legend, splitLabel, agreedOnTheWorst } from "@/components/InstrumentReport";

// The facilitated workspace for an instrument that asks its own questions.
//
// The gap analysis's Discussion tab, carried over rather than rebuilt: the same
// flag, the same four statuses, the same notes and decision, written to the
// same DiscussionNote rows keyed on assessment plus question. A question is an
// Activity row like any other, so nothing about the entity changes, and the
// report reads decisions and parked items back the same way for both.
//
// What differs is the order and the filter. There is no gap here, so questions
// come in the report's own agenda order — a non-negotiable somebody answered
// badly first, then by how split the room was — and the filter is that split.
// The numbers are the report's, counted over finished submissions only, so the
// bar a facilitator discusses is the bar the client is looking at.

const STATUS_CONFIG = {
  not_discussed:     { label: "Not Discussed",    color: "#6B7280", bg: "#F3F4F6" },
  in_discussion:     { label: "In Discussion",     color: "#B45309", bg: "#FFFBEB" },
  decision_recorded: { label: "Decision Recorded", color: "#065F46", bg: "#ECFDF5" },
  parked:            { label: "Parked for Later",  color: "#6D28D9", bg: "#F5F3FF" },
};
const STATUS_OPTIONS = ["not_discussed", "in_discussion", "decision_recorded", "parked"];

// Split and Some disagreement are what a session is for, so they are what the
// tab opens on; a flagged non-negotiable shows whatever its spread, because a
// room agreeing a product fails one is the worst finding on the page.
const FILTERS = [
  { key: "Split",             color: "#E11D48", ink: "#9F1239" },
  { key: "Some disagreement", color: "#F59E0B", ink: "#92400E" },
  { key: "Agreed",            color: "#10B981", ink: "#065F46" },
];

const isVeto = (q, d) => {
  if (!q.critical || !d) return false;
  const rated = d.counts.filter(c => c.points !== null);
  if (rated.length === 0) return false;
  const worst = Math.min(...rated.map(c => c.points));
  return rated.some(c => c.points === worst && c.n > 0);
};

function QuestionRow({ index, question, dist, expected, note, draft, saving, onDraft, onSave, onToggleFlag, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const split = splitLabel(dist.spread, agreedOnTheWorst(dist));
  const veto = isVeto(question, dist);
  const isFlagged = !!note?.flagged;
  const status = note?.status || "not_discussed";
  const statusCfg = STATUS_CONFIG[status];
  const toggle = () => setExpanded(e => !e);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={toggle}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
          className="flex items-start gap-3 flex-1 min-w-0 basis-full sm:basis-auto cursor-pointer"
        >
          <span className="text-sm text-gray-300 tabular-nums w-5 shrink-0 text-right">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-800">{question.name}</span>
            {question.section && <p className="text-xs text-gray-400 mt-0.5">{question.section}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-8 sm:ml-0">
          {veto && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-rose-700 bg-rose-50 border-rose-200">
              Non-negotiable
            </span>
          )}
          {split && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${split.tone}`}>
              {split.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <select
            value={status}
            onChange={e => onStatusChange(question.id, e.target.value)}
            aria-label="Discussion status"
            className="text-xs font-medium h-9 px-2 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-[#3366FF] cursor-pointer"
            style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
          <button
            onClick={() => onToggleFlag(question.id)}
            className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${isFlagged ? "text-amber-500 hover:text-amber-700" : "text-gray-300 hover:text-amber-400"}`}
            title={isFlagged ? "Remove flag" : "Flag for discussion"}
            aria-label={isFlagged ? "Remove flag" : "Flag for discussion"}
            aria-pressed={isFlagged}
          >
            <svg className="w-4 h-4" fill={isFlagged ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V5l7-2 4 2 7-2v13l-7 2-4-2-7 2z" />
            </svg>
          </button>
          <button
            onClick={toggle}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 sm:pl-[3.25rem] space-y-4">
          {question.description && <p className="text-sm text-gray-500">{question.description}</p>}
          <Distribution dist={dist} expected={expected} />
          {question.commentary && (
            <p className="text-sm text-gray-600 leading-relaxed pt-3 border-t border-gray-100">{question.commentary}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Facilitator notes (may be shared with client)
            </label>
            <textarea
              rows={3}
              placeholder="Add notes for the debrief conversation…"
              value={draft.note}
              onChange={e => onDraft(question.id, { note: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Team decision and next step
            </label>
            <input
              type="text"
              placeholder="What was decided or committed to?"
              value={draft.decision}
              onChange={e => onDraft(question.id, { decision: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          {/* Free text rather than the gap tab's role picker: an instrument
              never asks who owns anything, so there is no list of roles the
              room named to choose from. */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Responsible
            </label>
            <input
              type="text"
              placeholder="Who owns the next step?"
              value={draft.decision_role}
              onChange={e => onDraft(question.id, { decision_role: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3366FF] placeholder:text-gray-300"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => onSave(question.id)}
              disabled={saving}
              className="bg-[#3366FF] hover:bg-[#2952CC] disabled:opacity-50 text-white text-sm font-medium px-5 h-11 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstrumentDiscussion({ assessment }) {
  const [instrument, setInstrument] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [respondents, setRespondents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [notes, setNotes] = useState({});
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const [filter, setFilter] = useState(null); // null: split and some disagreement
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadData(); }, [assessment.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ activities, respondents: resps, responses: ress }, inst, existing] = await Promise.all([
        loadResultsData(assessment),
        loadInstrument(assessment),
        base44.entities.DiscussionNote.filter({ assessment_id: assessment.id }),
      ]);
      setInstrument(inst);
      setQuestions(inst ? orderQuestions(inst, activities) : activities);
      setRespondents(resps);
      setResponses(ress);
      const noteMap = {}, draftMap = {};
      for (const n of existing) {
        noteMap[n.activity_id] = n;
        draftMap[n.activity_id] = { note: n.note || "", decision: n.decision || "", decision_role: n.decision_role || "" };
      }
      setNotes(noteMap);
      setDrafts(draftMap);
    } catch (e) {
      console.error("Failed to load discussion data", e);
    }
    setLoading(false);
  };

  // One write per change, creating the row the first time a question is
  // touched. A failure is said on screen: a facilitator mid-session who thinks
  // a decision saved when it did not loses it for good.
  const writeNote = async (activityId, patch) => {
    const existing = notes[activityId];
    setError(null);
    try {
      const saved = existing
        ? await base44.entities.DiscussionNote.update(existing.id, patch)
        : await base44.entities.DiscussionNote.create({
            assessment_id: assessment.id,
            activity_id: activityId,
            note: "",
            decision: "",
            decision_role: "",
            flagged: false,
            status: "not_discussed",
            ...patch,
          });
      setNotes(prev => ({ ...prev, [activityId]: saved }));
    } catch (e) {
      console.error("Failed to save discussion note", e);
      setError("That change didn't save. Check your connection and try again.");
    }
  };

  const handleSave = async (activityId) => {
    setSaving(s => ({ ...s, [activityId]: true }));
    const d = drafts[activityId] || {};
    await writeNote(activityId, { note: d.note || "", decision: d.decision || "", decision_role: d.decision_role || "" });
    setSaving(s => ({ ...s, [activityId]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
      </div>
    );
  }

  const axis = instrument?.axes?.[0];
  if (!axis) {
    return <div className="p-8 text-center text-sm text-gray-400">This assessment has no instrument.</div>;
  }

  const completedIds = new Set(respondents.filter(r => r.status === "completed").map(r => r.id));
  const rowsByActivity = {};
  for (const row of responses) {
    if (completedIds.has(row.respondent_id)) (rowsByActivity[row.activity_id] ||= []).push(row);
  }

  const rated = questions.filter(q => q.question_type !== "text");
  const distributions = {};
  for (const q of rated) distributions[q.id] = distributionFor(q, rowsByActivity[q.id] || [], axis);
  const ordered = agendaOrder(rated, distributions);
  const labelOf = (q) => splitLabel(distributions[q.id].spread, false)?.text ?? null;

  const counts = Object.fromEntries(FILTERS.map(f => [f.key, ordered.filter(q => labelOf(q) === f.key).length]));
  const visible = ordered.filter(q => {
    const label = labelOf(q);
    if (filter === "all" || (filter === null && completedIds.size === 0)) return true;
    if (filter) return label === filter;
    return label === "Split" || label === "Some disagreement" || isVeto(q, distributions[q.id]);
  });

  const noteList = Object.values(notes);
  const flaggedCount = noteList.filter(n => n.flagged).length;
  const decidedCount = noteList.filter(n => n.decision?.trim()).length;
  const inDiscussionCount = noteList.filter(n => n.status === "in_discussion").length;
  const parkedCount = noteList.filter(n => n.status === "parked").length;

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-500 mb-6">
        <span><span className="font-semibold text-amber-600">{flaggedCount}</span> flagged for discussion</span>
        <span><span className="font-semibold text-green-700">{decidedCount}</span> with team decisions</span>
        <span><span className="font-semibold" style={{ color: STATUS_CONFIG.in_discussion.color }}>{inDiscussionCount}</span> in discussion</span>
        <span><span className="font-semibold" style={{ color: STATUS_CONFIG.parked.color }}>{parkedCount}</span> parked</span>
        <span className="text-gray-400">{rated.length} questions · {completedIds.size} finished</span>
      </div>

      {completedIds.size === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-sm text-gray-400">
          Nobody has finished yet, so there is nothing to order the questions by. They are listed in
          survey order, and notes can still be written ahead of the session.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map(({ key, color, ink }) => {
          const active = filter === key || (filter === null && key !== "Agreed");
          return (
            <button
              key={key}
              onClick={() => setFilter(f => (f === key ? null : key))}
              className={`flex items-center gap-2 px-3 h-9 rounded-full border text-xs font-medium transition-all ${active ? "shadow-sm" : "opacity-40 hover:opacity-70"}`}
              style={{ borderColor: color, backgroundColor: active ? color + "18" : "white", color: ink }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {key}
              <span className="font-bold">{counts[key]}</span>
            </button>
          );
        })}
        <span className="text-xs text-gray-400 ml-1">
          Showing {visible.length} of {rated.length} questions
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="ml-2 h-9 text-[#3366FF] hover:text-[#003366] font-medium">
              View all questions
            </button>
          )}
        </span>
      </div>

      <div className="mb-4"><Legend axis={axis} /></div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            The team agreed on every question.{" "}
            <button onClick={() => setFilter("all")} className="text-[#3366FF] font-medium">View all questions</button>
          </p>
        ) : visible.map(q => (
          <QuestionRow
            key={q.id}
            index={ordered.indexOf(q)}
            question={q}
            dist={distributions[q.id]}
            expected={completedIds.size}
            note={notes[q.id]}
            draft={drafts[q.id] || { note: "", decision: "", decision_role: "" }}
            saving={!!saving[q.id]}
            onDraft={(id, patch) => setDrafts(prev => ({ ...prev, [id]: { note: "", decision: "", decision_role: "", ...prev[id], ...patch } }))}
            onSave={handleSave}
            onToggleFlag={id => writeNote(id, { flagged: !notes[id]?.flagged })}
            onStatusChange={(id, status) => writeNote(id, { status })}
          />
        ))}
      </div>
    </div>
  );
}
