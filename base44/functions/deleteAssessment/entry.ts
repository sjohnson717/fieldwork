import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Deleting an assessment and everything hanging off it.
//
// This was a client-side cascade: the browser listed the children, deleted
// Response, Respondent, DiscussionNote and TeamLeaderFlag in batches, then
// deleted the Assessment last. Those five deletes are five separate RLS
// decisions, and they do not agree with each other. All four child entities
// permit any facilitator to delete by role; Assessment permits only its
// creator or a super-admin. So a facilitator running that cascade destroyed
// every respondent and response in the engagement and then failed on the last
// step, leaving an empty assessment, an error alert and no way back.
//
// The authority check therefore happens once, here, before anything is
// deleted, and the deletes then run as service role. Partial success is still
// possible if the platform errors midway, but it is no longer possible to be
// *permitted* to do the destructive part and denied the rest.
//
// Authority mirrors Assessment's own delete rule — creator or super-admin —
// rather than the broader read rule. Being able to see an engagement is not
// the same as being able to erase it.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 403 });

    const { assessmentId } = await req.json();
    if (!assessmentId) {
      return Response.json({ error: "assessmentId is required" }, { status: 400 });
    }

    const assessment = await base44.asServiceRole.entities.Assessment.get(assessmentId);
    if (!assessment) return Response.json({ error: "not_found" }, { status: 404 });

    const allowed =
      user.role === "admin" || assessment.created_by_id === user.id;

    // Same uniform "not_found" the other gated functions return, so a caller
    // cannot use the error to learn that an assessment exists.
    if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });

    const svc = base44.asServiceRole.entities;
    const [responses, respondents, notes, flags] = await Promise.all([
      svc.Response.filter({ assessment_id: assessmentId }),
      svc.Respondent.filter({ assessment_id: assessmentId }),
      svc.DiscussionNote.filter({ assessment_id: assessmentId }),
      svc.TeamLeaderFlag.filter({ assessment_id: assessmentId }),
    ]);

    // Batched rather than one Promise.all over everything: an assessment with
    // a large team runs to hundreds of responses, and the platform is happier
    // with a bounded number of concurrent deletes.
    const deleteAll = async (items, entity) => {
      const BATCH = 10;
      for (let i = 0; i < items.length; i += BATCH) {
        await Promise.all(items.slice(i, i + BATCH).map((item) => entity.delete(item.id)));
      }
    };

    await deleteAll(responses, svc.Response);
    await deleteAll(respondents, svc.Respondent);
    await deleteAll(notes, svc.DiscussionNote);
    await deleteAll(flags, svc.TeamLeaderFlag);
    await svc.Assessment.delete(assessmentId);

    return Response.json({
      deleted: {
        responses: responses.length,
        respondents: respondents.length,
        notes: notes.length,
        flags: flags.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
