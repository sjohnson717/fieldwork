import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import InstrumentEditor from "./InstrumentEditor";
import ContentSync from "./ContentSync";

// The seven instruments: their content, edited here or in the content files,
// and the panel that reconciles the two.
//
// An instrument's questions, commentary, bands, and reading are edited here with
// Edit content, in InstrumentEditor, and equally in content/instruments/<key>.md
// on GitHub. Neither one is the master copy. What makes that workable rather
// than a race is that both ends write the same file through the same field map,
// and Content files below compares them field by field before anything is
// written — see ContentSync.
//
// Apply source and the JSON download are gone with the seed they belonged to.
// Two writers for one field is the arrangement that produced the drift: a
// spelling fixed in the seed reported "0 updated, 54 unchanged" and changed
// nothing live, and a download that looked complete was missing ten prose
// fields. There is one writer now, and Save file emits exactly the file the app
// would commit.
//
// Super-admin only, matching the Library next to it and for the same reason:
// these are authored content that every organization reads and nobody else
// should be able to rewrite. A fractional CPO picks an instrument; they do not
// get to edit the questions inside it.
//
// Applying is safe to repeat. Every row is matched on the content_key it keeps
// across a rename, so a second run has nothing to do rather than doubling
// anything, and a question the file no longer lists is named and left alone —
// Response rows key on it, and deleting it would take its answers with it.
//
// `focus` comes from System Health's Open: an instrument to open, and the
// question in it to point at.
export default function InstrumentsPage({ focus = null, onApplied = null }) {
  const [instruments, setInstruments] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null);
  // Opened once. Coming back from the editor reloads this page, and must not
  // open the same instrument again.
  const focusApplied = useRef(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rows, questions] = await Promise.all([
        base44.entities.Instrument.list("sort_order"),
        base44.entities.Activity.list(),
      ]);
      setInstruments(rows);
      if (focus?.instrumentId && !focusApplied.current) {
        focusApplied.current = true;
        const target = rows.find(i => i.id === focus.instrumentId);
        if (target) setEditing(target);
      }
      const per = {};
      for (const q of questions) {
        for (const id of q.instrument_ids || []) per[id] = (per[id] || 0) + 1;
      }
      setCounts(per);
    } catch (e) {
      console.error("Failed to load instruments", e);
      // Before the first publish after these entities were added, the table
      // does not exist yet and the failure is confusing rather than alarming.
      setLoadError("Could not load instruments. If these entities were only just added, publish first — the schema is applied on publish.");
    }
    setLoading(false);
  };


  if (editing) {
    return <InstrumentEditor instrument={editing} focusQuestionId={focus?.instrumentId === editing.id ? focus.questionId : null} onBack={() => { setEditing(null); load(); }} />;
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* Above the list, because it is the screen's first question: are the app
          and the files saying the same thing? Reading the instruments below
          without knowing that is reading one of two answers and not knowing
          which. */}
      <ContentSync onApplied={async () => { await load(); await onApplied?.(); }} />

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Instruments</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${instruments.length} in the app`}
          </p>
        </div>

        <p className="text-xs text-gray-400 px-6 py-3 border-b border-gray-100">
          Each instrument's questions, commentary, bands, and reading are edited
          here — open one with Edit content. The same content is a file per
          instrument in content/instruments, editable on GitHub; Content files
          below compares the two and applies one at a time.
        </p>

        {loadError && <p className="text-xs text-red-500 px-6 py-3">{loadError}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#a3b8ff] border-t-[#4d80ff] rounded-full animate-spin" />
          </div>
        ) : instruments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Nothing yet. Compare with the content files below, then apply them.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {instruments.map(i => (
              <li key={i.id} className="px-6 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">
                    {i.name}
                    {/* Said on the one screen where every instrument is listed
                        together, because the difference is invisible
                        otherwise: this one is missing from the New Assessment
                        panel for everybody but us, and somebody wondering why
                        an org admin cannot find it should be able to see the
                        answer here. */}
                    {i.internal && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[#3366FF] bg-blue-50 px-1.5 py-0.5 rounded align-middle">
                        Ours only
                      </span>
                    )}
                  </p>
                  <span className="flex items-baseline gap-3 shrink-0">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {i.question_source === "library"
                        ? "from the activity library"
                        : `${counts[i.id] || 0} question${(counts[i.id] || 0) === 1 ? "" : "s"}`}
                    </span>
                    {i.question_source !== "library" && (
                      <button onClick={() => setEditing(i)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                        Edit content
                      </button>
                    )}
                  </span>
                </div>
                {i.tagline && <p className="text-xs text-gray-500 mt-0.5">{i.tagline}</p>}
                {/* Both descriptions, labelled: this is the screen where the
                    two audiences are edited, and shown unlabelled they read as
                    one paragraph somebody wrote twice. */}
                {i.summary && (
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    <span className="font-semibold text-gray-500">For the consultant. </span>{i.summary}
                  </p>
                )}
                {i.description && (
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    <span className="font-semibold text-gray-500">For the participant. </span>{i.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(i.sections || []).map(s => (
                    <span key={s} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
