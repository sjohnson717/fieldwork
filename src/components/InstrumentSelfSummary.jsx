import { scoreFor, bandFor } from "@/lib/instrument-scoring";
import ResumeLink from "@/components/ResumeLink";
import PrintCredit from "@/components/PrintCredit";

// What one person sees when they finish one of the four imported instruments.
//
// This is the one surface where a score and a band belong. The team report
// deliberately has neither — a mean placed in a band is a verdict drawn from
// numbers that may hide a wide split — but a single person's own answers are
// exactly what a band was written about, and withholding it here would leave
// the imported advice unused.
//
// A band, though, and not a score at all. Chaos and Portfolio Health have no
// bands, and what this page showed them was a number over a paragraph
// explaining that the number meant nothing on its own — so that pair went, and
// those two now go straight from the thank-you to what the person actually
// said. The other two keep the band and its advice, without the figure that
// used to sit above it. It is a courtesy either way, not the product: the
// engagement is the facilitated session.

// The verdict, with no number in front of it.
//
// The bands already carry a verdict in their names — Sunset, Discovery Required
// — and colouring them red would tell somebody their answers were wrong when
// what they were is honest.
//
// There is no score here any more. A figure out of a possible total invites the
// reader to do arithmetic on their own answers, and the arithmetic was never the
// point: the band is the finding and the advice under it is what to do about it.
// What survives is the one thing the number was carrying that the band cannot —
// that a verdict drawn from a half-finished survey says so out loud, rather than
// presenting itself as if everything had been answered.
function Verdict({ score, band }) {
  const partial = score.answered < score.of;
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <span className="text-sm font-semibold text-gray-700 border border-gray-200 rounded-full px-3 py-0.5">
        {band.name}
      </span>

      {partial && (
        <p className="text-xs text-gray-400 mt-3">
          Based on the {score.answered} of {score.of} questions you answered. Skipped questions
          are left out rather than counted against you.
        </p>
      )}

      {band.advice && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          {/* Preserves the paragraph breaks the advice was written with. It
              came across from a rich-text field and reads as a briefing, not a
              caption. */}
          {band.advice.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mb-3 last:mb-0">
              {para}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

export default function InstrumentSelfSummary({
  instrument,
  assessment,
  questions,
  responses,
  name,
  myToken,
  onRevise,
  resources = [],
}) {
  // A closed assessment is read-only for everyone: the numbers behind it have
  // been presented, and a late edit would move them.
  const closed = assessment?.status === "closed";

  // The reading attached to each question, by question id. Resolved against the
  // loaded list and silently dropping anything that will not resolve, the same
  // way every other reference in this app is treated — an article retired since
  // somebody answered should cost a link, not the page.
  const readingFor = (questionId) =>
    resources.filter((r) => (r.activity_ids || []).includes(questionId));
  const axis = instrument.axes?.[0];
  const rated = questions.filter(q => q.question_type !== "text");
  const score = axis ? scoreFor(questions, responses, axis) : null;
  const band = score ? bandFor(instrument.bands || [], score) : null;

  const answeredAny = rated.some(q => responses[q.id]?.answer);

  return (
    <div className="min-h-screen bg-gray-50 print-plain">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <header>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            {instrument.name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            Thank you, {name?.split(" ")[0] || "and well done"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {assessment?.subject
              ? <>Your answers about <span className="font-medium text-gray-700">{assessment.subject}</span> are recorded.</>
              : "Your answers are recorded."}
          </p>
        </header>

        {/* Only where a band applies. Chaos and Portfolio Health carry none, so
            they go straight from the thank-you to the answers; Product Success
            and Idea Reality show the band they landed in and the advice written
            for it. The score itself is gone from all four. */}
        {score && answeredAny && band && <Verdict score={score} band={band} />}

        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            What you said
          </h2>
          <ol className="space-y-6">
            {questions.map(q => {
              const r = responses[q.id] || {};
              const given = q.question_type === "text" ? r.answer_text : r.answer;
              return (
                <li key={q.id} className="break-inside-avoid">
                  <h3 className="text-sm font-semibold text-gray-800">{q.name}</h3>
                  {q.description && <p className="text-sm text-gray-500 mt-0.5">{q.description}</p>}
                  <p className="text-sm mt-1.5">
                    {given
                      ? <><span className="text-gray-400">Your answer: </span><span className="font-medium text-blue-700">{given}</span></>
                      : <span className="text-gray-400 italic">You skipped this one.</span>}
                  </p>
                  {/* The commentary explains the question, not the answer, which
                      is why one paragraph serves whatever was chosen — and why
                      it is worth showing even where somebody skipped. */}
                  {q.commentary && (
                    <p className="text-sm text-gray-600 leading-relaxed mt-2 pt-2 border-t border-gray-100">
                      {q.commentary}
                    </p>
                  )}
                  {/* Where to read more. On the person's own copy only — the
                      team report carries none, because a reading list is advice
                      to one reader rather than a finding about a room.

                      A real anchor with the title as its text, so it survives
                      being printed or pasted somewhere else. */}
                  {readingFor(q.id).map(r => (
                    <p key={r.id} className="text-sm mt-2">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-700 print:text-gray-600 print:no-underline"
                      >
                        {r.title}
                      </a>
                      {r.source && <span className="text-gray-400"> · {r.source}</span>}
                      {r.note && <span className="text-gray-400"> — {r.note}</span>}
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Revising is offered here, not only promised by the link below.
            The other two instruments have always had it, and the resume link
            says an answer can be changed — a page that only shows them makes
            that sentence a lie.

            Withheld once the assessment is closed. The aggregate has been
            reported by then and a late change would move numbers already
            presented; looking back at your own answers stays available, which
            is the half that costs nobody anything. */}
        {onRevise && !closed && (
          <div className="no-print flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 p-5">
            <div>
              <p className="text-sm font-medium text-gray-700">Changed your mind?</p>
              <p className="text-xs text-gray-400 mt-0.5">
                You can go back through the questions and submit again.
              </p>
            </div>
            <button
              onClick={onRevise}
              className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
            >
              Change my answers
            </button>
          </div>
        )}

        {myToken && (
          <div className="no-print">
            <ResumeLink
              token={myToken}
              description={closed
                ? "Keep this link to look back at your answers."
                : "Keep this link if you want to change an answer before the session."}
            />
          </div>
        )}

        <PrintCredit orgName={assessment?.org_name} />
      </div>
    </div>
  );
}
