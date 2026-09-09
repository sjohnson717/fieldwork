import { useState, useEffect, useRef } from "react";

// Choosing which of the six instruments to run.
//
// This replaced a two-button toggle inside the sidebar's inline form, which
// worked while there were two and stopped working at six: the choice decides
// what every respondent is asked and what comes out the other end, and it was
// being made from a pair of two-word labels in a 250px column.
//
// So: a panel, and the instruments describe themselves. The descriptions come
// from the Instrument records, which means a seventh instrument needs no code
// here — and it means the words a facilitator chooses by are the same words
// kept under review in the seed, rather than a second copy written into a
// component and quietly drifting.
//
// Two steps rather than one long form. Picking the instrument is the decision;
// naming the engagement is bookkeeping, and the fields it needs depend on what
// was picked — only some instruments are about a single named subject.
export default function NewAssessmentPanel({ instruments, creating, error, onCreate, onCancel }) {
  const [chosen, setChosen] = useState(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const titleRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape" && !creating) onCancel(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating, onCancel]);

  useEffect(() => { if (chosen) titleRef.current?.focus(); }, [chosen]);

  const needsSubject = !!chosen?.subject_label;
  const ready = title.trim() && (!needsSubject || subject.trim());

  const submit = () => {
    if (!ready || creating) return;
    onCreate({
      instrument: chosen,
      title: title.trim(),
      company_name: company.trim(),
      subject: subject.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="new-assessment-title">
      <div className="absolute inset-0 bg-gray-900/40" onClick={() => { if (!creating) onCancel(); }} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-baseline justify-between gap-4">
          <h2 id="new-assessment-title" className="text-base font-semibold text-gray-900">
            {chosen ? chosen.name : "New assessment"}
          </h2>
          {chosen ? (
            <button
              onClick={() => setChosen(null)}
              disabled={creating}
              className="text-xs text-gray-400 hover:text-[#3366FF] disabled:opacity-40 transition-colors shrink-0"
            >
              Choose a different one
            </button>
          ) : (
            <p className="text-xs text-gray-400 shrink-0">What are you running?</p>
          )}
        </div>

        {!chosen ? (
          <ul className="overflow-y-auto divide-y divide-gray-50">
            {instruments.map(i => (
              <li key={i.id}>
                <button
                  onClick={() => setChosen(i)}
                  className="w-full text-left px-6 py-4 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-900">{i.name}</p>
                    {/* What it costs a respondent, which is the other half of
                        the choice — a facilitator picking between six is also
                        deciding how much of a room's morning to spend. */}
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {i.question_source === "library" ? "you pick the activities" : `${i.question_count} questions`}
                    </span>
                  </div>
                  {i.tagline && <p className="text-xs text-gray-500 mt-0.5">{i.tagline}</p>}
                  {i.description && (
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3">{i.description}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-y-auto px-6 py-5 space-y-4">
            {chosen.description && (
              <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-200 pl-3">{chosen.description}</p>
            )}

            <div>
              <label htmlFor="na-title" className="block text-xs font-medium text-gray-500 mb-1.5">
                What to call this engagement
              </label>
              <input
                id="na-title"
                ref={titleRef}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={`${chosen.name} — Acme`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            <div>
              <label htmlFor="na-company" className="block text-xs font-medium text-gray-500 mb-1.5">
                Client company <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <input
                id="na-company"
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            {needsSubject && (
              <div>
                <label htmlFor="na-subject" className="block text-xs font-medium text-gray-500 mb-1.5">
                  {chosen.subject_label}
                </label>
                <input
                  id="na-subject"
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
                />
                {/* Required, and said plainly. This instrument asks about one
                    thing, so everyone answering has to be provably scoring the
                    same thing — otherwise the aggregate is several different
                    conversations added together. */}
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  Everyone answering will see this, so they are all scoring the same one.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={creating}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          {chosen && (
            <button
              onClick={submit}
              disabled={!ready || creating}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-[#3366FF] hover:bg-[#2952CC] text-white disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
