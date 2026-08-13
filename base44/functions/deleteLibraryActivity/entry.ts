import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Deleting an activity from the library.
//
// This is the most dangerous delete in the app, and until now it was the least
// guarded: a bare Activity.delete() in the browser whose only failure handling
// was console.error.
//
// getAssignedActivities() in src/lib/activities.js resolves an assessment's
// activity_ids against the *live* Activity rows. So deleting a library activity
// does not leave assessments with "their own copy of the selection", which is
// what the confirmation dialog used to claim. It removes the activity from every
// assessment that references it, at once, including ones already in flight and
// ones already submitted — whose Response rows keep an activity_id pointing at
// a row that is gone, so their report lines vanish with nothing to say a
// question was ever asked.
//
// Hence: refuse while anything references it, and point at the `active` flag,
// which is the reversible thing the operator almost always wants. Deactivating
// keeps the activity out of new assessments and leaves existing data whole.
//
// Super-admin only, matching the Library's own visibility.
//
// One exception to refusing. Resource.activity_ids is a list of pointers *to*
// this activity — "here is some reading for it" — not data about anything else,
// so a resource is updated to drop the id rather than blocking the delete. The
// dialog discloses the count; the alternative is refusing a delete because of a
// link the operator cannot see from the Activities tab.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let actor = null;
    try {
      actor = await base44.auth.me();
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!actor || actor.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { activityId } = await req.json();
    if (!activityId) {
      return Response.json({ error: "activityId is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;

    const activity = await svc.Activity.get(activityId);
    if (!activity) return Response.json({ error: "not_found" }, { status: 404 });

    // A custom activity belongs to one assessment and is removed from that
    // assessment's own Activities tab, where deleting it alongside its
    // responses is the understood meaning of the action.
    if (activity.assessment_id) {
      return Response.json({
        error: "That activity belongs to a single assessment. Remove it from that assessment's Activities tab instead.",
      }, { status: 409 });
    }

    const [sets, assessments, responses, notes, flags, resources] = await Promise.all([
      svc.ActivitySet.list(),
      svc.Assessment.list(),
      svc.Response.filter({ activity_id: activityId }),
      svc.DiscussionNote.filter({ activity_id: activityId }),
      svc.TeamLeaderFlag.filter({ activity_id: activityId }),
      svc.Resource.list(),
    ]);

    const inSets = sets.filter((s) => (s.activity_ids || []).includes(activityId));
    const inAssessments = assessments.filter((a) => (a.activity_ids || []).includes(activityId));
    const inResources = resources.filter((r) => (r.activity_ids || []).includes(activityId));

    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

    if (inSets.length || inAssessments.length || responses.length || notes.length || flags.length) {
      const parts = [];
      if (inAssessments.length) parts.push(plural(inAssessments.length, "assessment"));
      if (inSets.length) parts.push(plural(inSets.length, "activity set"));
      if (responses.length) parts.push(plural(responses.length, "submitted answer"));
      if (notes.length || flags.length) {
        parts.push(plural(notes.length + flags.length, "workshop note"));
      }
      return Response.json({
        error: `${activity.name} is used by ${parts.join(", ")}. Deactivate it instead — that keeps it out of new assessments without changing the ones that already use it.`,
        blockers: {
          assessments: inAssessments.length,
          sets: inSets.length,
          responses: responses.length,
          notes: notes.length,
          flags: flags.length,
        },
      }, { status: 409 });
    }

    // Pointers, not data — see the note at the top of this file.
    for (const r of inResources) {
      await svc.Resource.update(r.id, {
        activity_ids: (r.activity_ids || []).filter((id) => id !== activityId),
      });
    }

    await svc.Activity.delete(activityId);

    return Response.json({
      deleted: { id: activityId, name: activity.name, resourcesUpdated: inResources.length },
    });
  } catch (error) {
    console.error("deleteLibraryActivity", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
