import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Every idea anyone has filed, and what we decided about it.
//
// Super-admin only, and that is deliberate: it is a suggestion box, not a
// public backlog. Someone who files an idea should not have to watch it sit at
// "new" for a month, and we should be able to decline one without it reading
// as a verdict delivered in front of an audience.
//
// The status is the whole mechanism. "pursue" is the one with teeth — it is
// what a working session picks up and builds, and marking it is how an idea
// stops being a note and becomes work. Everything else is bookkeeping that
// keeps the list readable: "considering" means it is a real candidate,
// "declined" means it was read and answered, "done" means it shipped.
const STATUSES = [
  { key: "new", label: "New", tone: "bg-blue-100 text-blue-700" },
  { key: "considering", label: "Considering", tone: "bg-amber-100 text-amber-700" },
  { key: "pursue", label: "Pursue", tone: "bg-green-100 text-green-700" },
  { key: "done", label: "Done", tone: "bg-gray-100 text-gray-500" },
  { key: "declined", label: "Declined", tone: "bg-gray-100 text-gray-400" },
];
const TONE = Object.fromEntries(STATUSES.map(s => [s.key, s.tone]));
const LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label]));
const statusOf = (i) => (LABEL[i.status] ? i.status : "new");

const when = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

function Idea({ idea, who, onStatus, onNote, busy }) {
  const [note, setNote] = useState(idea.decision_note || "");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => { setNote(idea.decision_note || ""); }, [idea.id, idea.decision_note]);

  const status = statusOf(idea);
  const noteChanged = note.trim() !== (idea.decision_note || "").trim();

  return (
    <li className="px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{idea.title}</h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TONE[status]}`}>
          {LABEL[status]}
        </span>
      </div>

      {/* The problem first, and always shown. It is the half that decides
          whether this is worth building, and burying it under the proposal
          would put the solution back in front of the question again. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-1">The problem</p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{idea.problem}</p>

      {idea.idea && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-1">What they&rsquo;d like</p>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{idea.idea}</p>
        </>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        {who || "Someone"}
        {when(idea.created_date) && ` · ${when(idea.created_date)}`}
        {idea.context && ` · from ${idea.context}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => onStatus(idea, s.key)}
            disabled={busy || s.key === status}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-100 ${
              s.key === status
                ? "border-transparent bg-gray-900 text-white"
                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800 disabled:opacity-40"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Why it was marked that way. Written for whoever reads this list next,
          which is usually the person who wrote the note and has forgotten. */}
      <div className="mt-3 flex items-start gap-2">
        <textarea
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Why — for the next person to read this list"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
        />
        {noteChanged && (
          <button
            onClick={async () => { setSavingNote(true); await onNote(idea, note.trim()); setSavingNote(false); }}
            disabled={savingNote}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0"
          >
            {savingNote ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("open");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await base44.entities.Idea.list("-created_date");
      setIdeas(rows);
    } catch (e) {
      console.error("Failed to load ideas", e);
      // Before the first publish after this entity was added the table does
      // not exist, and the raw failure reads as a broken page.
      setError("Could not load ideas. If the Idea entity was only just added, publish first — the schema is applied on publish.");
    }
    setLoading(false);
    try {
      const res = await base44.functions.invoke("listUsers", {});
      const map = {};
      for (const u of res?.data?.users || []) map[u.id] = u.full_name || u.email;
      setNames(map);
    } catch (e) {
      // Names are a courtesy; the list is readable without them.
      console.error("Could not load who filed what", e);
    }
  };

  const patch = async (idea, fields) => {
    setBusyId(idea.id);
    try {
      const saved = await base44.entities.Idea.update(idea.id, fields);
      setIdeas(prev => prev.map(i => (i.id === idea.id ? { ...i, ...saved, ...fields } : i)));
    } catch (e) {
      console.error("Failed to update the idea", e);
      setError(e?.message || "Could not save that. Try again.");
    }
    setBusyId(null);
  };

  // "Open" is the working view: everything still live, newest first. Done and
  // declined are answered and would otherwise push the live ones down the page
  // as the list grows.
  const FILTERS = [
    { key: "open", label: "Open", test: (i) => !["done", "declined"].includes(statusOf(i)) },
    { key: "pursue", label: "Pursue", test: (i) => statusOf(i) === "pursue" },
    { key: "done", label: "Done", test: (i) => statusOf(i) === "done" },
    { key: "declined", label: "Declined", test: (i) => statusOf(i) === "declined" },
    { key: "all", label: "All", test: () => true },
  ];
  const active = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const shown = ideas.filter(active.test);
  const pursuing = ideas.filter(i => statusOf(i) === "pursue").length;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Ideas</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${ideas.length} filed · ${pursuing} to pursue`}
          </p>
        </div>

        <p className="text-xs text-gray-400 px-6 py-3 border-b border-gray-100 leading-relaxed">
          Anything anyone with a login has asked for. Mark the ones worth building
          <span className="font-medium text-gray-500"> Pursue</span> — that is the list a working
          session picks up, so marking it is how an idea becomes work. Nobody else sees this page,
          or what you decided.
        </p>

        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                filter === f.key
                  ? "border-transparent bg-gray-900 text-white"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              {f.label} · {ideas.filter(f.test).length}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-500 px-6 py-3">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            {ideas.length === 0 ? "Nothing filed yet." : `No ${active.label.toLowerCase()} ideas.`}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map(i => (
              <Idea
                key={i.id}
                idea={i}
                who={names[i.created_by_id]}
                busy={busyId === i.id}
                onStatus={(idea, status) => patch(idea, { status })}
                onNote={(idea, decision_note) => patch(idea, { decision_note })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
