import { base44 } from "@/api/base44Client";
import { facetRank } from "@/lib/scoring";

/**
 * Returns the activities assigned to an assessment:
 * - Library activities (no assessment_id) filtered by activity_ids if set,
 *   or all library activities if activity_ids is empty/missing.
 * - Custom activities where assessment_id matches this assessment.
 * Sorted primarily by facet order, secondarily by sort_order within each facet.
 */
export async function getAssignedActivities(assessmentRecord) {
  const all = await base44.entities.Activity.filter({ active: true }, "sort_order");

  // An instrument asks its own fixed list; there is no per-assessment
  // selection to apply. This has to come before the library rule below, which
  // reads an empty activity_ids as "all of them" — an instrument assessment
  // falling through would be handed the entire library as its survey.
  //
  // Left unsorted here on purpose. Section order belongs to the instrument, and
  // orderQuestions in lib/instruments.js is where it is applied; sorting by
  // facet on the way out would scramble it.
  if (assessmentRecord.instrument_id) {
    return all.filter(a => (a.instrument_ids || []).includes(assessmentRecord.instrument_id));
  }

  const ids = assessmentRecord.activity_ids;
  const hasFilter = Array.isArray(ids) && ids.length > 0;
  const library = all.filter(a => !a.assessment_id && (!hasFilter || ids.includes(a.id)));
  const custom = all.filter(a => a.assessment_id === assessmentRecord.id);
  return [...library, ...custom].sort((a, b) => {
    const facetDiff = facetRank(a.facet) - facetRank(b.facet);
    if (facetDiff !== 0) return facetDiff;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}