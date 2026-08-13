import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Deleting an organization that turned out to be a test.
//
// Organization.jsonc already permits a super-admin to delete one directly from
// the browser, so this function exists for the check rather than the delete:
// an org row is referenced by users, assessments and pending invitations, and
// none of those references are enforced by the platform. Deleting a populated
// org from the client would leave every one of them pointing at an id that
// resolves to nothing — users with an org_id whose name renders as "—",
// assessments an org admin can no longer see because the org condition can
// never match, and invitations that assign a new joiner to a ghost.
//
// So nothing cascades here. This refuses to delete an organization that is
// still referenced, and says what is referencing it. The alternative —
// reassigning or deleting other people's assessments as a side effect of
// tidying a list — is a decision for whoever is doing the tidying, not
// something to infer from a click on a Delete link.
//
// Super-admin only, matching the entity's own delete rule. An org admin
// deleting their own organization would be deleting themselves out of it.

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

    const { orgId } = await req.json();
    if (!orgId) {
      return Response.json({ error: "orgId is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;

    const org = await svc.Organization.get(orgId);
    if (!org) return Response.json({ error: "not_found" }, { status: 404 });

    // Read all three before deciding, so the refusal names everything in the
    // way at once. Told one blocker at a time, an operator clears it, clicks
    // again, and is refused for the next one.
    const [members, assessments, invitations] = await Promise.all([
      svc.User.filter({ org_id: orgId }),
      svc.Assessment.filter({ org_id: orgId }),
      svc.Invitation.filter({ org_id: orgId, status: "pending" }),
    ]);

    if (members.length || assessments.length || invitations.length) {
      const parts = [];
      if (members.length) parts.push(`${members.length} member${members.length === 1 ? "" : "s"}`);
      if (assessments.length) parts.push(`${assessments.length} assessment${assessments.length === 1 ? "" : "s"}`);
      if (invitations.length) parts.push(`${invitations.length} pending invitation${invitations.length === 1 ? "" : "s"}`);
      return Response.json({
        error: `${org.name} still has ${parts.join(", ")}. Move or remove them first, then delete the organization.`,
        blockers: {
          members: members.length,
          assessments: assessments.length,
          invitations: invitations.length,
        },
      }, { status: 409 });
    }

    await svc.Organization.delete(orgId);

    return Response.json({ deleted: { id: orgId, name: org.name } });
  } catch (error) {
    // Logged as well as returned: the platform log is the record that survives
    // whatever the browser did with the response body.
    console.error("deleteOrganization", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
