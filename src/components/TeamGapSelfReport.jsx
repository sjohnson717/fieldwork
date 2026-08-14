import { FACET_ORDER, IMPORTANCE_BADGE, EXECUTION_BADGE, BADGE_FALLBACK } from "@/lib/scoring";
import { PERSONAL_AXES } from "@/lib/personal-scoring";
import { computeSelfGapProfile } from "@/lib/self-gap";
import TeamGapSelfSummary from "@/components/TeamGapSelfSummary";
import PrintCredit from "@/components/PrintCredit";
import ChaosAssessmentPlug from "@/components/ChaosAssessmentPlug";

const QUARTZ_ICON = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/9e97ff5e6_Quartzicon.png";

// What a respondent sees after submitting a team gap assessment: their own
// summary, then every answer they gave. Lifted out of AssessPage so the
// facilitator's read-only preview renders the same screen from the same code
// rather than a second rendering of the same idea — two of those drift, and
// the whole point of the preview is to show what the respondent actually got.
//
// `responses` is keyed by activity id, which is AssessPage's own answer state.
// `readOnly` drops the controls that write or navigate — Revise, Done, and the
// closing note — leaving the page identical in every other respect.
export default function TeamGapSelfReport({
  assessment,
  respondent,
  name,
  title,
  activities,
  responses,
  isPersonal = false,
  returningCompleted = false,
  onRevise,
  onDone,
  readOnly = false,
}) {
  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));

  // The owner question is optional, and skipping it is common — the survey asks
  // it on every activity whenever the assessment defines roles, and a
  // respondent who answered none leaves a column of dashes running the length
  // of the appendix. Roles existing is what makes the question askable; an
  // answer to it is what makes the column worth printing.
  const hasOwners = !isPersonal
    && assessment?.roles?.length > 0
    && activities.some(a => responses[a.id]?.suggested_owner);

  // Local answer state is keyed by activity; the profile wants Response rows.
  const selfGapProfile = !isPersonal
    ? computeSelfGapProfile(
        activities,
        activities.map(act => ({ ...(responses[act.id] || {}), activity_id: act.id })),
        availableFacets,
      )
    : null;

  return (
  <div className="min-h-screen bg-gray-50 print-plain">
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Paper-only header: the on-screen one is conversational and has no
          assessment name or date, which a saved PDF needs to be useful. */}
      <div className="print-only print-cover mb-6">
        <img src={QUARTZ_ICON} alt="" className="h-8 w-8 mb-4 object-contain" />
        <h1 className="text-xl font-bold text-gray-900">{assessment?.title}</h1>
        {assessment?.company_name && (
          <p className="text-sm text-gray-600">{assessment.company_name}</p>
        )}
        <p className="text-sm text-gray-600 mt-2">
          {name}{title ? ` · ${title}` : ""}
        </p>
        {/* The submission date, not the print date — this is a record of
            what they said and when. Revising re-stamps it, so a reprinted
            copy always matches the answers shown on it.
            When someone has just submitted, "now" is the submission time.
            When they're revisiting and the stored date is missing, print
            no date at all: guessing today would date a week-old
            submission as though it were made this morning. */}
        {(() => {
          const submitted = respondent?.completed_date
            ? new Date(respondent.completed_date)
            : returningCompleted ? null : new Date();
          if (!submitted) return null;
          return (
            <p className="text-xs text-gray-500">
              Submitted {submitted.toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric"
              })}
            </p>
          );
        })()}
        <PrintCredit plug />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8 no-print">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {returningCompleted ? `Your responses, ${name}` : `Thank you, ${name}!`}
          </h1>
          {/* What follows the first sentence is addressed to the person who
              can act on it. In the facilitator's preview that reader is
              someone else, and telling them the answers can still be changed
              describes a power the preview deliberately doesn't give them. */}
          <p className="text-sm text-gray-500">
            {readOnly
              ? "Here's what you submitted."
              : !returningCompleted
                ? "Your responses have been recorded. Here's a summary of what you submitted."
                : assessment?.status === "closed"
                  ? "Here's what you submitted. This assessment is now closed, so your answers can't be changed."
                  : "Here's what you submitted. You can still change any of it."}
          </p>
        </div>
      </div>

      {/* The summary of what they said, above the answers themselves —
          the same order as the personal report. Suppressed when nothing is
          classifiable, which leaves the page as the plain confirmation it
          used to be rather than a run of empty sections. */}
      {selfGapProfile?.answeredCount > 0 && (
        <TeamGapSelfSummary profile={selfGapProfile} />
      )}

      {/* The detail tables get their own titled section. It used to be a
          one-line "your full answers are below" tacked onto the end of the
          profile — which then sat at the foot of a page introducing
          something overleaf, so the next page opened with a bare facet
          label and no idea what it belonged to. A real heading pinned to
          what follows fixes that without a forced page break. */}
      {selfGapProfile?.answeredCount > 0 && (
        <div className="print-section mb-5 pt-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Appendix</p>
          <h2 className="text-lg font-bold text-gray-900">Your responses</h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            All {activities.length} {activities.length === 1 ? "activity" : "activities"}, and how you rated each one.
          </p>
        </div>
      )}

      {/* Summary table grouped by facet */}
      {availableFacets.map(facet => {
        const facetActs = activities.filter(a => a.facet === facet);
        return (
          <div key={facet} className="mb-6">
            <div className="facet-heading text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 px-1">{facet}</div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-2/5">Activity</th>
                    {isPersonal ? PERSONAL_AXES.map(axis => (
                      // Centred to sit over the pills below rather than
                      // hanging off their left edge.
                      <th key={axis.key} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>{axis.label}</th>
                    )) : <>
                    {/* Centred over the pills below, like the personal axes
                        above: the pills are fixed-width and sat mid-column
                        while the headings hung off their left edge. */}
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Importance</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500" style={{ width: '120px' }}>Execution</th>
                    {hasOwners && (
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Suggested owner</th>
                    )}
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {facetActs.map((activity, idx) => {
                    const r = responses[activity.id] || {};
                    return (
                      <tr key={activity.id} className={idx < facetActs.length - 1 ? "border-b border-gray-50" : ""}>
                        <td className="px-4 py-3 text-gray-800 font-medium align-middle">{activity.name}</td>
                        {isPersonal ? PERSONAL_AXES.map(axis => (
                          <td key={axis.key} className="px-3 py-3 align-middle text-center" style={{ width: '120px' }}>
                            {r[axis.key]
                              ? <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" style={{ width: '104px', textAlign: 'center' }}>{r[axis.key]}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )) : <>
                        <td className="px-3 py-3 align-middle text-center" style={{ width: '120px' }}>
                          {r.importance
                            ? <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${IMPORTANCE_BADGE[r.importance] || BADGE_FALLBACK}`} style={{ width: '110px', textAlign: 'center' }}>{r.importance}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3 align-middle text-center" style={{ width: '120px' }}>
                          {r.execution
                            ? <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${EXECUTION_BADGE[r.execution] || BADGE_FALLBACK}`} style={{ width: '110px', justifyContent: 'center' }}>{r.execution}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        {hasOwners && (
                          <td className="px-3 py-3 text-gray-600 text-xs align-middle whitespace-nowrap text-center">{r.suggested_owner || <span className="text-gray-300">—</span>}</td>
                        )}
                        </>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Team gap only: the personal report closes itself, inside its own
          component, after the same tables. */}
      {/* Screen only. On paper the pointer rides on the cover's credit instead:
          held to the end it dragged a near-empty sheet along with it, and a
          report that closes on its own last table reads better anyway. On
          screen it stays where it was, where it can be clicked. */}
      {!isPersonal && <div className="no-print"><ChaosAssessmentPlug /></div>}

      {/* Team gap only. A personal assessment carries its actions above the
          answers table instead, and duplicating them here would put two
          copies of the resume link on one page — the one control on this
          page that hands over write access to someone's answers. */}
      {!isPersonal && (
        <>
          <div className="flex flex-wrap justify-center gap-4 mt-8 mb-4 no-print">
            {/* window.print() rather than a PDF library: every print dialog
                offers "Save as PDF", and the result is real selectable text
                instead of a screenshot. */}
            <button
              onClick={() => window.print()}
              className="font-medium px-6 py-2.5 rounded-lg transition-colors text-sm border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800"
            >
              Save as PDF
            </button>
            {/* A closed team assessment is read-only, even to someone
                reviewing their own submission — and so is the facilitator's
                preview, which is looking at someone else's answers. */}
            {!readOnly && assessment?.status !== "closed" && (
              <button
                onClick={onRevise}
                className="border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                ← Revise my answers
              </button>
            )}
            {/* "Done", not "Submit": submission already happened on the last
                facet page, which wrote the responses and stamped the
                respondent completed. This button only advances the screen, so
                naming it after a write implies answers are lost by closing
                the tab here — and the neighbouring Revise button is the one
                that actually writes. */}
            {!readOnly && (
              <button
                onClick={onDone}
                className="font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                {returningCompleted ? "Close" : "Done"}
              </button>
            )}
          </div>
          {!readOnly && !returningCompleted && (
            /* Screen chrome, and marked as such: without no-print this closing
               nudge printed underneath the credit, splitting the one block on
               the page that is meant to close it. */
            <p className="no-print text-center text-xs text-gray-400">Your feedback will help shape the team's professional development plan.</p>
          )}
        </>
      )}
    </div>
  </div>
  );
}
