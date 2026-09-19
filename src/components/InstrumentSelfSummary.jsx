import { scoreFor, bandFor, dimensionScores, dimensionCallouts } from "@/lib/instrument-scoring";
import { surveyNumbers } from "@/lib/instruments";
import { capReading } from "@/lib/reading";
import ResumeLink from "@/components/ResumeLink";
import PrintCredit from "@/components/PrintCredit";
import Commentary from "@/components/Commentary";
import DimensionProfile from "@/components/DimensionProfile";
import QuartzBridge from "@/components/QuartzBridge";

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
  // Capped: see src/lib/reading.js. A question that has collected eight
  // articles offers the first two, in the library's own order.
  const readingFor = (questionId) =>
    capReading(resources.filter((r) => (r.activity_ids || []).includes(questionId)));
  const axis = instrument.axes?.[0];
  const rated = questions.filter(q => q.question_type !== "text");

  // The five-dimension profile, which is the deliverable on one instrument and
  // nothing on the other four. Everything else on this page is shared, so it
  // branches here rather than in a second copy of the whole summary.
  const dimensional = instrument.report_style === "dimension";

  // The same number the facilitator's list and the team report show, so that
  // "number four" means one question in the room rather than three.
  const numbers = surveyNumbers(questions);
  const score = axis ? scoreFor(questions, responses, axis) : null;
  const band = score ? bandFor(instrument.bands || [], score, { basis: instrument.band_basis }) : null;
  const dimensions = dimensional && axis
    ? dimensionScores(instrument, questions, responses, axis)
    : [];
  const callouts = dimensional
    ? dimensionCallouts(dimensions)
    : { strongest: [], leverage: [] };

  const answeredAny = rated.some(q => responses[q.id]?.answer);

  // One answered question, with its commentary and reading. Extracted from
  // the list below because a dimension report groups the same items under
  // their dimension headings and a flat one does not, and two copies of this
  // markup would drift the way the gap bar's two copies did.
  const answerItem = (q) => {
            const r = responses[q.id] || {};
            const given = q.question_type === "text" ? r.answer_text : r.answer;
            return (
              <li key={q.id} className="break-inside-avoid">
                <h3 className="text-sm font-semibold text-gray-800">
                  {/* Written answers carry no number — they are gathered
                      rather than discussed — so the heading keeps its place
                      whether or not there is a figure in front of it. */}
                  {numbers.has(q.id) && (
                    <span className="text-gray-300 mr-2 tabular-nums">{numbers.get(q.id)}</span>
                  )}
                  {q.name}
                </h3>
                {q.description && <p className="text-sm text-gray-500 mt-0.5">{q.description}</p>}
                <p className="text-sm mt-1.5">
                  {given
                    ? <><span className="text-gray-400">Your answer: </span><span className="font-medium text-blue-700">{given}</span></>
                    : <span className="text-gray-400 italic">You skipped this one.</span>}
                </p>
                {/* The commentary explains the question, not the answer, which
                    is why one paragraph serves whatever was chosen — and why
                    it is worth showing even where somebody skipped.

                    It sits in a panel with the reading that belongs to it:
                    both are ours rather than theirs, and a reader scanning
                    their own answers should be able to see at a glance which
                    lines they wrote. */}
                <Commentary text={q.commentary}>
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
                </Commentary>
              </li>
            );
  };

  return (
    <div className="min-h-screen bg-gray-50 print-plain">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <header>
          {/* The engagement's own name, which carries the instrument, the
              client, and which run this is. The instrument alone could not
              tell a respondent which of two Chaos Assessments they just
              answered. Falls back to the instrument for anything named
              before the standard. */}
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            {assessment?.title || instrument.name}
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

        {/* Above the answers, because it is the finding and they are the
            evidence for it. The bars come from the same numbers the band did,
            so a profile with no answers in it renders nothing rather than five
            empty rails. */}
        {dimensional && (
          <DimensionProfile
            dimensions={dimensions}
            sections={instrument.sections_meta || []}
            callouts={callouts}
          />
        )}

        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            What you said
          </h2>
          {/* Grouped under the dimension headings on the profile, flat on
              the other four. The groups are what make the bars above
              legible: a reader who wants to know why ENABLE is short reads
              the three statements sitting under it, rather than hunting
              them out of a list of fifteen. */}
          {dimensional ? (
            <div className="space-y-6">
              {(instrument.sections || [])
                .filter(name => questions.some(q => q.section === name))
                .map(name => (
                  <div key={name}>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{name}</h3>
                    <ol className="space-y-6">
                      {questions.filter(q => q.section === name).map(answerItem)}
                    </ol>
                  </div>
                ))}
            </div>
          ) : (
            <ol className="space-y-6">
              {questions.map(answerItem)}
            </ol>
          )}
        </section>

        {/* Revising is offered here, not only promised by the link below.
            The other two instruments have always had it, and the resume link
            says an answer can be changed — a page that only shows them makes
            that sentence a lie.

            Withheld once the assessment is closed. The aggregate has been
            reported by then and a late change would move numbers already
            presented; looking back at your own answers stays available, which
            is the half that costs nobody anything. */}
        {/* Last thing before the housekeeping: the reader has had the profile,
            the two callouts, and every one of their own answers explained
            before anything is offered to them. */}
        {dimensional && <QuartzBridge />}

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
