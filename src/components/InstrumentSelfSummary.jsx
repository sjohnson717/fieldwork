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
// It is still a courtesy, not the product. The engagement is the facilitated
// session, so this says so: the score is theirs, the conversation is the team's.

// A quiet band. The bands already carry a verdict in their names — Sunset,
// Discovery Required — and colouring them red would tell somebody their answers
// were wrong when what they were is honest.
function Score({ score, band, instrument }) {
  const pct = score.possible ? Math.round((score.earned / score.possible) * 100) : 0;
  const partial = score.answered < score.of;
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-baseline gap-3">
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {score.earned}
          <span className="text-gray-300 font-normal"> / {score.possible}</span>
        </p>
        {band && (
          <span className="text-sm font-semibold text-gray-700 border border-gray-200 rounded-full px-3 py-0.5">
            {band.name}
          </span>
        )}
      </div>

      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>

      {/* What the number is actually out of, said plainly. Somebody who
          answered six of nine is scored on six — the alternative was Wix's,
          where a blank counted as a wrong answer and an abandoned survey read
          as a genuinely bad result. */}
      <p className="text-xs text-gray-400 mt-2">
        {partial
          ? `Based on the ${score.answered} of ${score.of} questions you answered. Skipped questions are left out rather than counted against you.`
          : `Across all ${score.of} questions.`}
      </p>

      {band?.advice && (
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

      {!band && instrument.bands?.length === 0 && (
        <p className="text-sm text-gray-500 mt-4 leading-relaxed">
          There is no single verdict for this one. What it is for is the pattern across your
          answers, and how that compares with everyone else&rsquo;s — which is what your
          facilitator will bring to the session.
        </p>
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
}) {
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

        {score && answeredAny && <Score score={score} band={band} instrument={instrument} />}

        {/* Said before the answers rather than after, because it is the frame
            they should be read in: this page is one person's, and the thing it
            leads to is a room. */}
        <section className="border-l-2 border-gray-300 pl-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            This is your own copy. Your answers are read alongside everyone else&rsquo;s, and
            where the team agrees and disagrees is the part worth an hour of the
            room&rsquo;s time — that is what your facilitator works from, not this number.
          </p>
        </section>

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
                </li>
              );
            })}
          </ol>
        </section>

        {myToken && (
          <div className="no-print">
            <ResumeLink
              token={myToken}
              description="Keep this link if you want to change an answer before the session."
            />
          </div>
        )}

        <PrintCredit orgName={assessment?.org_name} />
      </div>
    </div>
  );
}
