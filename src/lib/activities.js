import { base44 } from "@/api/base44Client";
import { isLibraryActivity, selectAssignedActivities } from "@/lib/activity-kind";

// Re-exported so the screens that have always imported it from here still can.
// The rule itself lives in activity-kind.js, away from the client this module
// builds on import.
export { isLibraryActivity };


// The activities assigned to an assessment. The rule is selectAssignedActivities
// in activity-kind.js; this only fetches what it needs.
export async function getAssignedActivities(assessmentRecord) {
  const [all, instruments] = await Promise.all([
    base44.entities.Activity.filter({ active: true }, "sort_order"),
    assessmentRecord.instrument_id
      ? base44.entities.Instrument.filter({ id: assessmentRecord.instrument_id })
      : [],
  ]);
  return selectAssignedActivities(assessmentRecord, instruments[0] || null, all);
}
