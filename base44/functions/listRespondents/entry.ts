import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Respondents for one assessment, for the admin side.
//
// Respondent carries the team members' names and job titles, which — with the
// customer name on Assessment — is the data one consultant must not see from
// another consultant's engagement. Locking Respondent.read with RLS alone
// cannot express the rule we actually want, because RLS cannot join: the
// question "may this user see this respondent?" is really "may this user see
// the parent assessment?", and the answer depends on Assessment.org_id and
// Assessment.collaborator_ids.
//
// Denormalising those onto Respondent would break the cross-org facilitator
// case (a facilitator invited to one assessment in another consultant's org)
// and would go stale whenever collaborators change. So the check happens here
// instead, mirroring Assessment's own access rules, and the read runs as
// service role.
//
// Authorisation is derived entirely from the caller's own record and the
// stored assessment. Nothing about access comes from the request body except
// which assessment is being asked about.

const sameOrg = (a, b) => (a || null) === (b || null);

// Explicit, because the platform's own default page size is not the app's to
// assume, and a newsletter link can bring in more people than it covers.
const ALL = 5000;

// Everything the Results tabs' funnel shows that is not a name: visits by
// source and by device, what people did with their report once they had it,
// and where the ones who did not finish stopped. Counts only, and computed
// here so that no row about any one person travels to the browser for it.
//
// "What they did" is counted in people, not clicks: recordEvent keeps one row
// per person per event, and reading links, which can each be clicked once,
// are folded to one per person here.
const funnelSummary = async (svc, assessmentId) => {
  const [arrivalRows, events, respondents] = await Promise.all([
    svc.Arrival.filter({ assessment_id: assessmentId }, null, ALL),
    svc.RespondentEvent.filter({ assessment_id: assessmentId }, null, ALL),
    svc.Respondent.filter({ assessment_id: assessmentId }, null, ALL),
  ]);

  const counts = {};
  const arrivalDevices = {};
  for (const r of arrivalRows) {
    const key = `${r.source || ""}\u0000${r.campaign || ""}`;
    counts[key] = (counts[key] || 0) + 1;
    const d = r.device || "unknown";
    arrivalDevices[d] = (arrivalDevices[d] || 0) + 1;
  }

  const living = new Set(respondents.map((r) => r.id));
  const people = {};
  for (const e of events) {
    // A respondent removed before this cascade existed can leave rows behind;
    // they are nobody now and count as nobody.
    if (!living.has(e.respondent_id)) continue;
    (people[e.event] ||= new Set()).add(e.respondent_id);
  }
  const afterFinishing = Object.fromEntries(Object.entries(people).map(([k, v]) => [k, v.size]));

  return {
    arrivals: Object.entries(counts).map(([key, count]) => {
      const [source, campaign] = key.split("\u0000");
      return { source: source || null, campaign: campaign || null, count };
    }),
    arrivalDevices,
    afterFinishing,
    stoppedIn: await stoppedIn(svc, assessmentId, respondents),
  };
};

// For each person who started and has not finished, the page their latest
// answer is on: its section for an instrument that asks its own questions, its
// facet for one that draws on the library, which is how the survey pages them.
// Someone with no answer at all stopped on the first page, before saving it.
const stoppedIn = async (svc, assessmentId, respondents) => {
  const unfinished = respondents.filter((r) => r.status !== "completed");
  if (!unfinished.length) return [];
  const waiting = new Set(unfinished.map((r) => r.id));
  const rows = await svc.Response.filter({ assessment_id: assessmentId }, null, ALL);

  const latest = new Map();
  const when = (row) => Date.parse(row.updated_date || row.created_date) || 0;
  for (const row of rows) {
    if (!waiting.has(row.respondent_id)) continue;
    const held = latest.get(row.respondent_id);
    if (!held || when(row) > when(held)) latest.set(row.respondent_id, row);
  }

  const activityIds = [...new Set([...latest.values()].map((row) => row.activity_id))];
  const activities = await Promise.all(activityIds.map((id) => svc.Activity.get(id).catch(() => null)));
  const pageOf = new Map(activities.filter(Boolean).map((a) => [a.id, a.section || a.facet || null]));

  const tally = {};
  for (const r of unfinished) {
    const row = latest.get(r.id);
    const page = row ? (pageOf.get(row.activity_id) || "Unknown") : null;
    const key = page ?? "";
    tally[key] = (tally[key] || 0) + 1;
  }
  return Object.entries(tally)
    .map(([page, count]) => ({ page: page || null, count }))
    .sort((a, b) => b.count - a.count);
};

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

    const { assessmentId, arrivals } = await req.json();
    if (!assessmentId) {
      return Response.json({ error: "assessmentId is required" }, { status: 400 });
    }

    const assessment = await base44.asServiceRole.entities.Assessment.get(assessmentId);
    if (!assessment) return Response.json({ error: "not_found" }, { status: 404 });

    // Mirrors Assessment's access rules: super-admin sees everything, an org
    // admin sees their own organisation's work, and anyone who created or was
    // invited to this specific assessment sees it.
    const allowed =
      user.role === "admin" ||
      assessment.created_by_id === user.id ||
      (assessment.collaborator_ids || []).includes(user.id) ||
      (user.role === "org_admin" && sameOrg(assessment.org_id, user.org_id));

    if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });

    // Visits to the code link, counted by where they came from. Asked for on
    // its own, beside the respondent list rather than inside it, so every
    // caller that only wants names keeps the shape it has. Counts, not rows:
    // the Results tabs show a funnel, and nothing about one visit is worth
    // sending to the browser.
    if (arrivals) {
      return Response.json(await funnelSummary(base44.asServiceRole.entities, assessmentId));
    }

    const respondents = await base44.asServiceRole.entities.Respondent.filter({
      assessment_id: assessmentId,
    }, null, ALL);

    return Response.json({
      respondents: respondents.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title || null,
        status: r.status,
        completed_date: r.completed_date || null,
        created_date: r.created_date,
        first_completed_date: r.first_completed_date || null,
        device: r.device || null,
        source: r.source || null,
        medium: r.medium || null,
        campaign: r.campaign || null,
        // The two closing questions from the end of the survey. Admin-side
        // only, which is the whole reason they come through this function
        // rather than any of publicAssessment's shapes — they are collected to
        // improve the instrument, and they are never reported to a buyer or a
        // team leader, or raised in the discussion.
        closing_comments: r.closing_comments || null,
        missing_coverage: r.missing_coverage || null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
