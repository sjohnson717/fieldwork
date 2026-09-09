import { distributionFor, agendaOrder } from "@/lib/instrument-scoring";
import PrintCredit from "@/components/PrintCredit";

// The team report for an instrument that asks its own questions.
//
// It leads with distribution, not with a score. A mean placed in a band is a
// verdict, and a verdict is what the individual's own summary is for; here the
// point is the shape of the room. Eight people answering "Absolutely" and two
// answering "Never" average to "Somewhat", which is the one reading that is
// certainly wrong, and it is exactly the reading a headline number would print.
//
// Questions are ordered by how much the team disagreed, with any non-negotiable
// somebody answered badly ahead of all of them. That order is the agenda: the
// Chaos Assessment's own closing advice tells a buyer to gather the team and
// work out where perceptions differ, and this is that, computed.

const BAR = ["bg-rose-400", "bg-amber-400", "bg-lime-400", "bg-emerald-500"];

// Colour by position on the scale rather than by label, so a four-point
// challenge scale and a three-point risk scale both read worst-to-best without
// either being named here.
const toneFor = (i, total) =>
  BAR[Math.round((total <= 1 ? 0 : i / (total - 1)) * (BAR.length - 1))];

function Distribution({ dist, expected }) {
  // Counted against the roster, not against the rows this question happens to
  // have. Someone who stopped before reaching the page leaves no row at all, so
  // a blank measured from the rows alone would report nobody skipped anything.
  const missing = Math.max(0, (expected ?? dist.given) - dist.given);
  const max = Math.max(1, ...dist.counts.map(c => c.n));
  return (
    <div className="space-y-1.5">
      {dist.counts.map((c, i) => (
        <div key={c.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-gray-500 text-right">{c.label}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-sm overflow-hidden">
            {c.n > 0 && (
              <div
                className={`h-5 ${c.points === null ? "bg-gray-300" : toneFor(i, dist.counts.length)}`}
                style={{ width: `${(c.n / max) * 100}%` }}
              />
            )}
          </div>
          <span className="w-6 shrink-0 text-xs text-gray-600 tabular-nums">{c.n || ""}</span>
        </div>
      ))}
      {missing > 0 && (
        <p className="text-[11px] text-gray-400 pl-[7.75rem]">
          {missing} didn&rsquo;t answer this
        </p>
      )}
    </div>
  );
}

// How split the room was, in words. A number between 0 and 1 is precise and
// tells a facilitator nothing they can act on; these three bands are what the
// agenda actually turns on.
const splitLabel = (spread) => {
  if (spread === null) return null;
  if (spread >= 0.6) return { text: "Split", tone: "text-rose-700 bg-rose-50 border-rose-200" };
  if (spread >= 0.25) return { text: "Some disagreement", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  return { text: "Agreed", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
};

export default function InstrumentReport({
  instrument,
  assessment,
  questions,
  responsesByActivity,
  respondentCount,
  completedCount,
}) {
  const axis = instrument.axes?.[0];
  if (!axis) return null;

  const rated = questions.filter(q => q.question_type !== "text");
  const distributions = {};
  for (const q of rated) {
    distributions[q.id] = distributionFor(q, responsesByActivity[q.id] || [], axis);
  }
  const ordered = agendaOrder(rated, distributions);

  // Written answers, gathered rather than counted. Seven people's answers to
  // "where would you put an extra million" side by side is a page a facilitator
  // reads out; it is not a statistic and there is nothing to average.
  //
  // Only questions the instrument marks reportable appear. The respondent's own
  // closing fields are a different thing on a different entity and stay out of
  // every report by construction.
  const textQuestions = questions.filter(q => q.question_type === "text" && q.reportable_text);

  const splitCount = ordered.filter(q => (distributions[q.id]?.spread ?? 0) >= 0.6).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 print-plain">
      <header className="mb-8">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
          {instrument.name}
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{assessment.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {assessment.company_name && <>{assessment.company_name} · </>}
          {completedCount} of {respondentCount} {respondentCount === 1 ? "person has" : "people have"} finished
          {assessment.subject && <> · about <span className="font-medium text-gray-700">{assessment.subject}</span></>}
        </p>
      </header>

      {/* No overall score. Said out loud rather than left as an absence: a
          reader who took this instrument on Wix got a number, and its absence
          here is a decision, not an omission. */}
      <section className="mb-8 border-l-2 border-gray-300 pl-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          There is no team score. The questions below are ordered by how much this team
          disagreed with itself, because that is what a session is for — a number averaged
          across {respondentCount} {respondentCount === 1 ? "person" : "people"} would hide
          exactly the splits worth an hour of the room&rsquo;s time.
          {splitCount > 0 && (
            <> {splitCount === 1 ? "One question" : `${splitCount} questions`} came back genuinely split.</>
          )}
        </p>
      </section>

      <ol className="space-y-8">
        {ordered.map((q, i) => {
          const d = distributions[q.id];
          const split = splitLabel(d.spread);
          const worst = Math.min(...d.counts.filter(c => c.points !== null).map(c => c.points));
          const flagged = q.critical && d.counts.some(c => c.points === worst && c.n > 0);
          return (
            <li key={q.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-gray-900">
                  <span className="text-gray-300 mr-2 tabular-nums">{i + 1}</span>
                  {q.name}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  {flagged && (
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
              </div>
              {q.description && <p className="text-sm text-gray-500 mb-3">{q.description}</p>}
              <Distribution dist={d} expected={completedCount} />
              {q.commentary && (
                <p className="text-sm text-gray-600 leading-relaxed mt-3 pt-3 border-t border-gray-100">
                  {q.commentary}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {textQuestions.map(q => {
        const written = (responsesByActivity[q.id] || [])
          .map(r => (r?.answer_text || "").trim())
          .filter(Boolean);
        if (written.length === 0) return null;
        return (
          <section key={q.id} className="mt-10 break-inside-avoid">
            <h2 className="text-base font-semibold text-gray-900">{q.name}</h2>
            {q.description && <p className="text-sm text-gray-500 mt-0.5 mb-3">{q.description}</p>}
            {/* Unattributed, and in the order they arrived. The survey promises
                answers are read in aggregate, and a paragraph is recognisable
                enough without a name on it. */}
            <ul className="space-y-2">
              {written.map((t, i) => (
                <li key={i} className="text-sm text-gray-700 border-l-2 border-gray-200 pl-3 leading-relaxed">
                  {t}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <PrintCredit orgName={assessment.org_name} />
    </div>
  );
}
