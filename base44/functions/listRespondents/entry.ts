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

    // Mirrors Assessment's access rules: super-admin sees everything, an org
    // admin sees their own organisation's work, and anyone who created or was
    // invited to this specific assessment sees it.
    const allowed =
      user.role === "admin" ||
      assessment.created_by_id === user.id ||
      (assessment.collaborator_ids || []).includes(user.id) ||
      (user.role === "org_admin" && sameOrg(assessment.org_id, user.org_id));

    if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });

    const respondents = await base44.asServiceRole.entities.Respondent.filter({
      assessment_id: assessmentId,
    });

    return Response.json({
      respondents: respondents.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title || null,
        status: r.status,
        completed_date: r.completed_date || null,
        created_date: r.created_date,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
