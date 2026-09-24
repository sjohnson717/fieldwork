import { base44 } from "@/api/base44Client";
import { facetRank } from "@/lib/scoring";
import { isLibraryActivity } from "@/lib/activity-kind";

// Re-exported so the screens that have always imported it from here still can.
// The rule itself lives in activity-kind.js, away from the client this module
// builds on import.
export { isLibraryActivity };


/**
 * Returns the activities assigned to an assessment:
 * - Library activities (no assessment_id) filtered by activity_ids if set,
 *   or all library activities if activity_ids is empty/missing.
 * - Custom activities where assessment_id matches this assessment.
 * Sorted primarily by facet order, secondarily by sort_order within each facet.
 */
export async function getAssignedActivities(assessmentRecord) {
  const [all, instruments] = await Promise.all([
    base44.entities.Activity.filter({ active: true }, "sort_order"),
    assessmentRecord.instrument_id
      ? base44.entities.Instrument.filter({ id: assessmentRecord.instrument_id })
      : [],
  ]);

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
  if (instruments[0]?.question_source === "instrument") {
    return all.filter(a => (a.instrument_ids || []).includes(assessmentRecord.instrument_id));
  }

  const ids = assessmentRecord.activity_ids;
  const hasFilter = Array.isArray(ids) && ids.length > 0;
  const library = all.filter(a => isLibraryActivity(a) && (!hasFilter || ids.includes(a.id)));
  const custom = all.filter(a => a.assessment_id === assessmentRecord.id);
  return [...library, ...custom].sort((a, b) => {
    const facetDiff = facetRank(a.facet) - facetRank(b.facet);
    if (facetDiff !== 0) return facetDiff;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}