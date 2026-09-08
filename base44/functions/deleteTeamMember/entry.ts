import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Deleting the account row of someone who has no access.
//
// User.jsonc sets "delete": null, so this cannot be done from the browser at
// all — the service role is the only path, and that is deliberate. Two things
// keep it narrow:
//
//   Only "user" (No access) rows. Revoking is the reversible step and stays
//   the way you take someone's access away; this is the second, separate step
//   that clears the row out of the list afterwards. Anyone still holding a
//   role has to be revoked first, which means the operator has already seen
//   and confirmed what they are losing.
//
//   Super-admin, or the org admin of the organisation the account was revoked
//   out of. This used to be super-admin only, for a reason that was true at the
//   time: revoking clears org_id, so a no-access row was in nobody's
//   organization and an org admin could never have been looking at one. That
//   made every departure at a client a support request to us, which does not
//   hold up once the org admins are fractional CPOs running their own
//   engagements. updateTeamMember now records former_org_id on revoke, so the
//   row still knows whose person it was.
//
//   former_org_id is matched strictly — a null former_org_id never matches, so
//   an org admin with no organisation of their own cannot reach the legacy
//   no-org accounts, which is exactly the hole a permissive null-equals-null
//   comparison would open here.
//
// What this does not do is delete the person's login. Base44 owns the auth
// account; this removes the application's record of them. If they sign in
// again the platform creates a fresh row on the default "user" role, which is
// exactly the state we just deleted — no access to anything. The dialog says
// so, because a Delete that can be undone by the other party is not what an
// operator assumes it means.
//
// It also refuses while an assessment still names them, rather than quietly
// orphaning the reference. created_by_id is what Assessment's own delete rule
// checks, so dropping the account behind it turns an assessment into one only
// a super-admin can ever remove; a stale collaborator_ids entry keeps granting
// access by id to a row that no longer exists.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let actor = null;
    try {
      actor = await base44.auth.me();
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!actor || !["admin", "org_admin"].includes(actor.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (userId === actor.id) {
      return Response.json({ error: "You cannot delete your own account." }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;

    const target = await svc.User.get(userId);
    if (!target) return Response.json({ error: "not_found" }, { status: 404 });

    if (target.role !== "user") {
      return Response.json({
        error: "Only accounts with no access can be deleted. Revoke their access first.",
      }, { status: 409 });
    }

    // The org boundary, checked after the no-access gate so an org admin gets
    // the same "revoke them first" sentence a super-admin does rather than a
    // flat refusal that reads as a permissions bug.
    //
    // Deliberately not the sameOrg helper used elsewhere: that treats null as a
    // bucket two accounts can share, which is right for the legacy no-org
    // users and wrong here, where it would hand every orgless revoked row to
    // any org admin who also happens to have no organisation.
    if (actor.role !== "admin" && (!actor.org_id || target.former_org_id !== actor.org_id)) {
      return Response.json({
        error: "That account was not revoked from your organization.",
      }, { status: 403 });
    }

    const [created, all] = await Promise.all([
      svc.Assessment.filter({ created_by_id: userId }),
      // collaborator_ids is an array, which entity filters cannot search, so
      // this is a scan. Assessment counts here are in the dozens; the cost is
      // one list on a path taken once per account cleared out.
      svc.Assessment.list(),
    ]);
    const collaborating = all.filter(a => (a.collaborator_ids || []).includes(userId));

    if (created.length || collaborating.length) {
      const parts = [];
      if (created.length) parts.push(`created ${created.length} assessment${created.length === 1 ? "" : "s"}`);
      if (collaborating.length) parts.push(`is a collaborator on ${collaborating.length}`);
      const who = target.full_name || target.email || "That account";
      return Response.json({
        error: `${who} ${parts.join(" and ")}. Reassign or delete those first, then delete the account.`,
        blockers: { created: created.length, collaborating: collaborating.length },
      }, { status: 409 });
    }

    // Any pending invitation for this address goes too. Left behind, it would
    // sit in the Facilitators list under an account that no longer exists, and
    // accepting it would hand out a role we just cleared away.
    const email = (target.email || "").toLowerCase();
    const invitations = email
      ? (await svc.Invitation.filter({ status: "pending" }))
          .filter(inv => (inv.email || "").toLowerCase() === email)
      : [];
    for (const inv of invitations) {
      await svc.Invitation.update(inv.id, { status: "revoked" });
    }

    await svc.User.delete(userId);

    return Response.json({
      deleted: { id: userId, email: target.email || null, invitationsRevoked: invitations.length },
    });
  } catch (error) {
    console.error("deleteTeamMember", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
