import { base44 } from "@/api/base44Client";

const FACET_ORDER = ["DEFINE", "COMMIT", "DESCRIBE", "CREATE", "PREPARE", "DELIVER"];

/**
 * Returns the activities assigned to an assessment:
 * - Library activities (no assessment_id) filtered by activity_ids if set,
 *   or all library activities if activity_ids is empty/missing.
 * - Custom activities where assessment_id matches this assessment.
 * Sorted primarily by facet order, secondarily by sort_order within each facet.
 */
export async function getAssignedActivities(assessmentRecord) {
  const all = await base44.entities.Activity.filter({ active: true }, "sort_order");
  const ids = assessmentRecord.activity_ids;
  const hasFilter = Array.isArray(ids) && ids.length > 0;
  const library = all.filter(a => !a.assessment_id && (!hasFilter || ids.includes(a.id)));
  const custom = all.filter(a => a.assessment_id === assessmentRecord.id);
  return [...library, ...custom].sort((a, b) => {
    const facetDiff = (FACET_ORDER.indexOf(a.facet) ?? 99) - (FACET_ORDER.indexOf(b.facet) ?? 99);
    if (facetDiff !== 0) return facetDiff;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}