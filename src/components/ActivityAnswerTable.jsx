import { FACET_ORDER, IMPORTANCE_BADGE, EXECUTION_BADGE, BADGE_FALLBACK } from "@/lib/scoring";
import { PERSONAL_AXES, heatClass, normalize } from "@/lib/personal-scoring";

// Every answer a respondent gave, grouped by facet.
//
// One definition, because there were two. The team gap report's copy had been
// made to survive a phone — a horizontal scroll below sm, sm-only column
// widths, smaller pills — and the personal report's copy, rendering the same
// three axes with the same heat ramp, had none of it. The QA sweep's standing
// "personal profile clips below 430px" finding was that difference: 45 of the
// 65 findings at 320px landed on `px-3 py-2.5` cells that exist only in the
// copy nobody fixed.
//
// `responses` is keyed by activity id. The personal report holds its answers as
// profile rows instead and maps them on the way in, rather than this component
// learning two shapes.
export default function ActivityAnswerTable({ activities, responses, isPersonal = false, hasOwners = false }) {
  const availableFacets = FACET_ORDER.filter(f => activities.some(a => a.facet === f));

  return (
    <>
    {availableFacets.map(facet => {
      const facetActs = activities.filter(a => a.facet === facet);
      return (
        <div key={facet} className="mb-6">
          <div className="facet-heading text-xs font-bold uppercase tracking-widest text-blue-600 mb-2 px-1">{facet}</div>
          {/* Three columns fit a phone once the widths below stop being
              fixed; four — the role that owns it today, or the personal report's three
              axes — do not, by about 30px at 375px. Those scroll sideways
              inside the card rather than losing the last column's right edge
              to overflow-hidden. From sm up, which includes the printed
              sheet, there is nothing to scroll and the card clips as before
              so the table's corners stay rounded. */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto sm:overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {/* Every width here is sm-and-up only. The fixed columns
                      below add up to more than a phone is wide, and the card
                      that wraps this table is overflow-hidden, so the last
                      pill in each row had its right end sliced off — the text
                      stayed readable, which is why it looked like a rounded
                      rectangle that had simply lost its corner. Below sm the
                      table lays itself out from its own contents instead. */}
                  <th className="text-left px-3 sm:px-4 py-2.5 text-xs font-semibold text-gray-500 sm:w-2/5">Activity</th>
                  {isPersonal ? PERSONAL_AXES.map(axis => (
                    // Centred to sit over the pills below rather than
                    // hanging off their left edge.
                    <th key={axis.key} className="text-center px-1 sm:px-3 py-2.5 text-[11px] sm:text-xs font-semibold text-gray-500 sm:w-[120px]">{axis.label}</th>
                  )) : <>
                  {/* Centred over the pills below, like the personal axes
                      above: the pills are fixed-width and sat mid-column
                      while the headings hung off their left edge. */}
                  <th className="text-center px-1.5 sm:px-3 py-2.5 text-xs font-semibold text-gray-500 sm:w-[120px]">Importance</th>
                  <th className="text-center px-1.5 sm:px-3 py-2.5 text-xs font-semibold text-gray-500 sm:w-[120px]">Execution</th>
                  {hasOwners && (
                    /* Phone: no column of its own. Four columns overflow a
                       375px card, and this is the one whose content is a
                       sentence rather than a rating — it reads perfectly well
                       under the activity name, which is where it goes below
                       sm. */
                    <th className="hidden sm:table-cell text-center px-1.5 sm:px-3 py-2.5 text-xs font-semibold text-gray-500">Owns it today</th>
                  )}
                  </>}
                </tr>
              </thead>
              <tbody>
                {facetActs.map((activity, idx) => {
                  const r = responses[activity.id] || {};
                  return (
                    <tr key={activity.id} className={idx < facetActs.length - 1 ? "border-b border-gray-50" : ""}>
                      <td className="px-3 sm:px-4 py-3 text-gray-800 font-medium align-middle">
                        {activity.name}
                        {hasOwners && r.suggested_owner && (
                          /* The phone home for the ownership column.
                             Labelled, because without the column heading
                             above it a bare role name under an activity
                             could be read as part of the activity. */
                          <span className="sm:hidden block text-xs font-normal text-gray-500 mt-0.5">
                            Owner: {r.suggested_owner}
                          </span>
                        )}
                      </td>
                      {isPersonal ? PERSONAL_AXES.map(axis => (
                        <td key={axis.key} className="px-1 sm:px-3 py-3 align-middle text-center sm:w-[120px]">
                          {r[axis.key]
                            /* Same ramp as the personal report proper — this
                               table is the fallback that renders when there
                               is no classifiable profile to lead with.
                               A point smaller on a phone, and tighter: three
                               axis columns beside the activity name are what
                               this table can just fit at 375px, and at text-xs
                               they were 20px too wide for it. */
                            ? <span className={`inline-block whitespace-nowrap px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium text-center w-full sm:w-[104px] ${heatClass(normalize(axis.key, r[axis.key]))}`}>{r[axis.key]}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      )) : <>
                      <td className="px-1.5 sm:px-3 py-3 align-middle text-center sm:w-[120px]">
                        {r.importance
                          ? <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center w-full sm:w-[110px] ${IMPORTANCE_BADGE[r.importance] || BADGE_FALLBACK}`}>{r.importance}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-1.5 sm:px-3 py-3 align-middle text-center sm:w-[120px]">
                        {r.execution
                          ? <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium text-center w-full sm:w-[110px] ${EXECUTION_BADGE[r.execution] || BADGE_FALLBACK}`}>{r.execution}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* The owner cell wraps. These are job titles now, and "Head of
                          Product Management / Principal Product Manager" is 53 characters
                          against the 18 of the function name it replaced — held on one
                          line it set the column's width and squeezed the activity name
                          and both badge columns to fit around it. */}
                      {hasOwners && (
                        <td className="hidden sm:table-cell px-1.5 sm:px-3 py-3 text-gray-600 text-xs align-middle text-center">{r.suggested_owner || <span className="text-gray-300">—</span>}</td>
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
    </>
  );
}
