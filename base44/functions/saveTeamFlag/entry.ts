import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// A team leader flagging an activity for their consultant, written server-side
// against their team token.
//
// TeamLeaderFlag used to be written from the browser, which needed its read and
// update rules open to the world: anyone could list every note every team
// leader had left, on every client, and edit them. The note is the leader's
// private reason for flagging, shown to their consultant, so the rules are now
// staff-only and the team page reads flags through publicAssessment and writes
// them here. The token IS the credential, as everywhere else outside the admin
// area.
//
// Upserts by activity, so the browser never holds or sends a row id.

const MAX_NOTE = 2000;

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    const { token, activity_id, flagged, note } = await req.json();
    if (!token || typeof token !== "string" || !activity_id || typeof activity_id !== "string") {
      return Response.json({ error: "token and activity_id are required" }, { status: 400 });
    }
    if (typeof flagged !== "boolean") {
      return Response.json({ error: "flagged must be true or false" }, { status: 400 });
    }
    if (note != null && (typeof note !== "string" || note.length > MAX_NOTE)) {
      return Response.json({ error: "note is too long" }, { status: 400 });
    }

    const assessments = await svc.Assessment.list();
    const assessment = assessments.find((x) => x.team_token && x.team_token === token);
    if (!assessment) return notFound();

    // The activity has to be one this assessment could ask about: a library
    // activity, or a custom one made for this assessment.
    const activity = (await svc.Activity.filter({ id: activity_id }))?.[0];
    if (!activity || (activity.assessment_id && activity.assessment_id !== assessment.id)) {
      return notFound();
    }

    const existing = (await svc.TeamLeaderFlag.filter({
      assessment_id: assessment.id,
      activity_id,
    }))?.[0];
    const payload = {
      assessment_id: assessment.id,
      activity_id,
      flagged,
      note: note || "",
    };
    const saved = existing
      ? await svc.TeamLeaderFlag.update(existing.id, payload)
      : await svc.TeamLeaderFlag.create(payload);

    return Response.json({ flag: saved });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
