import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Removes one visit from an assessment's arrivals funnel.
//
// Two callers. The Results tabs' funnel table offers it on a row with more
// visits than starts, for a test click nobody went on with. And removing a
// respondent takes one visit with them, so a test run through the survey,
// removed afterwards, leaves no trace in the counts.
//
// Arrivals carry no names and no link to a respondent, and do not need one:
// they are counted by source and campaign, so any one visit from the same
// source and campaign is as good as another. `before`, when given, keeps the
// choice to visits made before that moment — a respondent's own visit came
// before they started, and a respondent from before arrivals were counted
// then matches nothing rather than taking someone else's.
//
// Given `respondentId`, it also removes what that respondent did with their
// report (RespondentEvent), for the same reason: a removed test run should
// leave nothing in any count. Those rows are matched on this assessment as
// well as the respondent, so the access check above covers them.
//
// Arrival's own RLS is super-admin only, because the survey writes it as
// service role and nobody else should write it at all. Removing one is gated
// here instead, on the same rule as listRespondents: anyone who may see the
// assessment's respondents may correct its counts.

const sameOrg = (a, b) => (a || null) === (b || null);
const ALL = 5000;

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

    const { assessmentId, source, campaign, before, respondentId } = await req.json();
    if (!assessmentId) {
      return Response.json({ error: "assessmentId is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;
    const assessment = await svc.Assessment.get(assessmentId);
    if (!assessment) return Response.json({ error: "not_found" }, { status: 404 });

    const allowed =
      user.role === "admin" ||
      assessment.created_by_id === user.id ||
      (assessment.collaborator_ids || []).includes(user.id) ||
      (user.role === "org_admin" && sameOrg(assessment.org_id, user.org_id));
    if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });

    let eventsRemoved = 0;
    if (respondentId) {
      const events = await svc.RespondentEvent.filter({ assessment_id: assessmentId, respondent_id: respondentId }, null, ALL);
      await Promise.all(events.map((e) => svc.RespondentEvent.delete(e.id)));
      eventsRemoved = events.length;
    }

    const rows = await svc.Arrival.filter({ assessment_id: assessmentId }, null, ALL);
    const cutoff = before ? Date.parse(before) : Infinity;
    // The newest match: a test click is usually the latest one, and when it is
    // not, any match counts the same.
    const match = rows
      .filter((r) => (r.source || "") === (source || "") && (r.campaign || "") === (campaign || ""))
      .filter((r) => Date.parse(r.created_date) <= cutoff)
      .sort((a, b) => Date.parse(b.created_date) - Date.parse(a.created_date))[0];

    if (!match) return Response.json({ removed: 0, eventsRemoved });
    await svc.Arrival.delete(match.id);
    return Response.json({ removed: 1, eventsRemoved });
  } catch (error) {
    console.error("removeArrival", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
