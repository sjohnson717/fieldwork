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

    // Names the failing step in the thrown message. A bare cascade failure
    // surfaced only as "Request failed with status code 500", which says
    // nothing about which of five entities refused — and the one thing you
    // need to know about a half-finished delete is how far it got.
    const stage = async (name, fn) => {
      try {
        return await fn();
      } catch (e) {
        throw new Error(`${name} failed: ${e?.message || e}`);
      }
    };

    const [responses, respondents, notes, flags, customActivities] = await Promise.all([
      stage("reading responses",  () => svc.Response.filter({ assessment_id: assessmentId })),
      stage("reading respondents", () => svc.Respondent.filter({ assessment_id: assessmentId })),
      stage("reading notes",      () => svc.DiscussionNote.filter({ assessment_id: assessmentId })),
      stage("reading flags",      () => svc.TeamLeaderFlag.filter({ assessment_id: assessmentId })),
      stage("reading custom activities", () => svc.Activity.filter({ assessment_id: assessmentId })),
    ]);

    // Batched rather than one Promise.all over everything: an assessment with
    // a large team runs to hundreds of responses, and the platform is happier
    // with a bounded number of concurrent deletes.
    const deleteAll = async (label, items, entity) => {
      const BATCH = 10;
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        await stage(
          `deleting ${label} ${i + 1}-${i + chunk.length} of ${items.length}`,
          () => Promise.all(chunk.map((item) => entity.delete(item.id))),
        );
      }
    };

    await deleteAll("responses", responses, svc.Response);
    await deleteAll("respondents", respondents, svc.Respondent);
    await deleteAll("notes", notes, svc.DiscussionNote);
    await deleteAll("flags", flags, svc.TeamLeaderFlag);

    // Custom activities name this assessment and are meaningless without it.
    // They were previously left behind, so every assessment ever deleted has
    // been leaking Activity rows whose assessment_id points at nothing — dead
    // records that the library list hides (it filters on assessment_id) and
    // nothing else ever reads.
    await deleteAll("custom activities", customActivities, svc.Activity);

    await stage("deleting the assessment", () => svc.Assessment.delete(assessmentId));

    return Response.json({
      deleted: {
        responses: responses.length,
        respondents: respondents.length,
        notes: notes.length,
        flags: flags.length,
        customActivities: customActivities.length,
      },
    });
  } catch (error) {
    // Also logged, because the message only reaches the caller if the client
    // reads the response body — and the platform log is the record that
    // survives whatever the browser did with it.
    console.error("deleteAssessment", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
