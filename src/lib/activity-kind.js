import { facetRank } from "@/lib/scoring";
import { asksOwnQuestions } from "@/lib/instrument-kind";

// What kind of row an Activity is, as a rule with nothing behind it.
//
// Its own file because it is a pure predicate and activities.js is not: that
// module builds the backend client on import, which means anything wanting this
// one line used to drag the whole SDK along with it. health-checks.js is pure
// by design — given records and a clock, it returns the checks — and could not
// be tested without standing up a browser for a client it never calls.
//
// A library activity is shared across assessments and is not an instrument's
// own question. Instrument questions carry no assessment_id either, so testing
// both fields is what separates the three kinds of row this entity holds.
export const isLibraryActivity = (a) => !a.assessment_id && !(a.instrument_ids || []).length;

// Re-exported for the callers that have always imported it from here. The rule
// lives with the other kind rules in instrument-kind.js.
export { asksOwnQuestions };

/**
 * The activities an assessment asks, given its instrument and every active
 * activity. getAssignedActivities fetches and hands them in; the rule is here so
 * it can be tested without the client.
 * - Library activities filtered by activity_ids if set, or all of them if
 *   activity_ids is empty/missing.
 * - Custom activities where assessment_id matches this assessment.
 * Sorted primarily by facet order, secondarily by sort_order within each facet.
 *
 * saveResponses keeps its own copy of this rule, server-side, to decide which
 * answers it accepts. Change one and change the other.
 */
export function selectAssignedActivities(assessment, instrument, all) {
  // An instrument asks its own fixed list; there is no per-assessment
  // selection to apply. This has to come before the library rule below, which
  // reads an empty activity_ids as "all of them" — an instrument assessment
  // falling through would be handed the entire library as its survey.
  //
  // Left unsorted here on purpose. Section order belongs to the instrument, and
  // orderQuestions in lib/instruments.js is where it is applied; sorting by
  // facet on the way out would scramble it.
  //
  // Only for an instrument that asks its own questions. Team gap and personal
  // are instruments too, and every one made from the New Assessment panel
  // carries their instrument_id, but their questions are the library's and
  // carry no instrument_ids — branching on instrument_id alone handed them an
  // empty survey.
  if (asksOwnQuestions(instrument)) {
    return all.filter(a => (a.instrument_ids || []).includes(instrument.id));
  }

  const ids = assessment.activity_ids;
  const hasFilter = Array.isArray(ids) && ids.length > 0;
  const library = all.filter(a => isLibraryActivity(a) && (!hasFilter || ids.includes(a.id)));
  const custom = all.filter(a => a.assessment_id === assessment.id);
  return [...library, ...custom].sort((a, b) => {
    const facetDiff = facetRank(a.facet) - facetRank(b.facet);
    if (facetDiff !== 0) return facetDiff;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}
