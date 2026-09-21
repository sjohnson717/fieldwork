import { useState, useEffect, useRef } from "react";
import {
  titleCase,
  composeAssessmentTitle,
  NAMING_EXAMPLE,
  NAMING_NOTE,
  GENERIC_COMPANY,
} from "@/lib/assessment-naming";

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
//
// The name itself is not freehand any more. It is the three parts of the
// naming standard (see src/lib/assessment-naming.js), collected separately and
// joined for you, with the result shown as you type — because this string
// becomes the heading on every report someone reads, and a box that merely
// suggested the shape was producing six kinds of name.
export default function NewAssessmentPanel({ instruments, creating, error, onCreate, onCancel }) {
  const [chosen, setChosen] = useState(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [modifier, setModifier] = useState("");
  const [tagline, setTagline] = useState("");
  const [subject, setSubject] = useState("");
  const modifierRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape" && !creating) onCancel(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating, onCancel]);

  // The instrument name fills the first part of the standard, in Title Case,
  // so the common case is two fields and not three. Reset it whenever the
  // instrument changes, including on "Choose a different one" — otherwise the
  // name of the instrument they backed out of stays in the box.
  useEffect(() => {
    setName(chosen ? titleCase(chosen.name) : "");
    // The client and the run are theirs to type; jump to the one they are
    // least likely to have a default for.
    if (chosen) modifierRef.current?.focus();
  }, [chosen]);

  const needsSubject = !!chosen?.subject_label;
  const title = composeAssessmentTitle({ name, company, modifier });
  const ready =
    name.trim() && company.trim() && modifier.trim() && (!needsSubject || subject.trim());

  const submit = () => {
    if (!ready || creating) return;
    onCreate({
      instrument: chosen,
      title,
      company_name: company.trim(),
      tagline: tagline.trim(),
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
                  {/* The consultant's summary, and only the survey intro if an
                      instrument has not been given one yet: this list is the
                      one screen where the choice is made, and the respondent's
                      intro is the wrong voice for it. */}
                  {(i.summary || i.description) && (
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3">{i.summary || i.description}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-y-auto px-6 py-5 space-y-4">
            {(chosen.summary || chosen.description) && (
              <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-200 pl-3">{chosen.summary || chosen.description}</p>
            )}

            {/* The standard, said at the top where it is read before the
                fields rather than after them. */}
            <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2.5">
              <p className="text-[11px] font-medium text-blue-900">How assessments are named</p>
              <p className="text-[11px] text-blue-900/70 leading-snug mt-0.5">{NAMING_NOTE}</p>
              <p className="text-[11px] text-blue-900/60 mt-1 font-mono break-words">{NAMING_EXAMPLE.full}</p>
            </div>

            <div>
              <label htmlFor="na-name" className="block text-xs font-medium text-gray-500 mb-1.5">
                Instrument name
              </label>
              <input
                id="na-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={NAMING_EXAMPLE.name}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            <div>
              <label htmlFor="na-company" className="block text-xs font-medium text-gray-500 mb-1.5">
                Client company
              </label>
              <input
                id="na-company"
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={`${NAMING_EXAMPLE.company} — or ${GENERIC_COMPANY}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
              {/* Required now, because a report heading with no client on it
                  cannot be told from the next client's. An open workshop or a
                  demo still has an answer, and it is one word. */}
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                Use {GENERIC_COMPANY} when there is no single client — an open workshop, a demo, a talk.
              </p>
            </div>

            <div>
              <label htmlFor="na-modifier" className="block text-xs font-medium text-gray-500 mb-1.5">
                Which run this is
              </label>
              <input
                id="na-modifier"
                ref={modifierRef}
                type="text"
                value={modifier}
                onChange={e => setModifier(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder={NAMING_EXAMPLE.modifier}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
              {/* The part that tells two runs for the same client apart a year
                  later: a baseline, a quarter, a date, a cohort. */}
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                A baseline, a quarter, a date, a cohort — whatever separates this from the next one.
              </p>
            </div>

            <div>
              <label htmlFor="na-tagline" className="block text-xs font-medium text-gray-500 mb-1.5">
                Description <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <input
                id="na-tagline"
                type="text"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="A line of context, shown under the title on reports"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3366FF]"
              />
            </div>

            {/* The name as it will be saved, and as every report will head
                its first page. Shown rather than described, and labelled for
                what it is: this is the thing itself, not a summary of it. */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[11px] text-gray-400 mb-1">As it appears</p>
              <p className="text-sm font-medium text-gray-800 break-words">
                {title || <span className="text-gray-300">{NAMING_EXAMPLE.full}</span>}
              </p>
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
