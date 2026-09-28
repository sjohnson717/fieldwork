import { base44 } from "@/api/base44Client";
import { getAssignedActivities } from "@/lib/activities";
import { listRespondents, removeArrival } from "@/lib/public-assessment";

// The three reads every results tab opens with, and the delete both of them
// offer. Shared because they were identical in AssessmentResults and
// PersonalResults, and a divergence here would be invisible: two pages quietly
// disagreeing about what "the results" are, or one of them leaving orphaned
// Response rows behind after a delete.
//
// Loading returns data rather than setting state, and deleting returns nothing
// — each page still owns its own state, because what else has to change after
// a delete differs between them.

export async function loadResultsData(assessment) {
  const [activities, respondents, responses] = await Promise.all([
    getAssignedActivities(assessment),
    // Respondent names come from a backend function, not a direct read: the
    // entity's RLS cannot express "only for assessments you may see".
    listRespondents(assessment.id),
    base44.entities.Response.filter({ assessment_id: assessment.id }),
  ]);
  return { activities, respondents, responses };
}

// Answers first, then the person. The other order leaves rows whose
// respondent_id points at nothing — invisible on every screen, and still
// counted by anything that aggregates by assessment.
//
// Then one visit from the same source, made before they started, and what
// they did with their report. Most removals
// are test runs, and a test run left in the arrivals funnel reads as a reader
// who clicked and walked away. Not fatal when it fails: the person is gone,
// and a stray visit can still be removed from the funnel table.
export async function deleteRespondentCascade(respondent, assessmentId) {
  const { id } = respondent;
  const responses = await base44.entities.Response.filter({ respondent_id: id });
  for (const r of responses) await base44.entities.Response.delete(r.id);
  await base44.entities.Respondent.delete(id);
  try {
    await removeArrival(assessmentId, respondent, respondent.created_date, id);
  } catch (e) {
    console.error("Failed to remove the respondent's visit", e);
  }
}
