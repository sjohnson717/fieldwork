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
//   Only a super-admin. Revoking clears org_id, so a no-access row is never in
//   anyone's organization — an org admin scoped to their own org could never
//   be looking at one of these rows in the first place.
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
    if (!actor || actor.role !== "admin") {
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
