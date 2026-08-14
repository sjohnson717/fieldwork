import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// User.jsonc's update RLS only lets a user edit their own record (plus
// "admin", the super-admin). That deliberately removed org_admin's blanket
// write access to the User entity, which previously let any org admin
// promote themselves to admin or reassign users out of their org.
//
// Team management still has to work, so it goes through here instead, where
// we can gate it properly with the service role:
//
//   admin (super-admin) — may set any role on anyone, and move anyone
//                         between organizations.
//   org_admin           — may only touch users already in their own org,
//                         may only grant "facilitator" or "org_admin", and
//                         may never change anyone's org_id.
//
// Nobody may change their own role here (self-demotion/escalation loops); the
// UI blocks that too. Organisation is the one exception, and only for the
// super-admin: their access does not derive from org membership, so setting it
// escalates nothing — while an org_admin, who may never change anyone's org,
// still may not change their own. The exception exists because the super-admin
// was the one account that could not be given an org at all, and the printed
// reports name the organisation that prepared them.

const sameOrg = (a, b) => (a || null) === (b || null);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();

    if (!actor || !["admin", "org_admin"].includes(actor.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { userId, role, orgId } = await req.json();
    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (userId === actor.id) {
      const orgOnly = role === undefined && orgId !== undefined;
      if (!(actor.role === "admin" && orgOnly)) {
        return Response.json({ error: "You cannot change your own access." }, { status: 403 });
      }
    }

    const target = await base44.asServiceRole.entities.User.get(userId);
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (actor.role === "admin") {
      if (role !== undefined) {
        if (!["admin", "org_admin", "facilitator", "user"].includes(role)) {
          return Response.json({ error: "Unknown role" }, { status: 400 });
        }
        updates.role = role;
        // Revoking access clears org membership too, matching what the
        // confirmation dialog tells the operator.
        if (role === "user") updates.org_id = null;
      }
      if (orgId !== undefined) updates.org_id = orgId || null;
    } else {
      // org_admin
      if (!sameOrg(target.org_id, actor.org_id)) {
        return Response.json({ error: "That user is not in your organization." }, { status: 403 });
      }
      if (role !== undefined) {
        // "user" is allowed so an org admin can revoke access within their org.
        if (!["org_admin", "facilitator", "user"].includes(role)) {
          return Response.json({ error: "You cannot grant that role." }, { status: 403 });
        }
        updates.role = role;
      }
      if (orgId !== undefined && !sameOrg(orgId, actor.org_id)) {
        return Response.json({ error: "You cannot move users between organizations." }, { status: 403 });
      }
      // Revoking access also clears org membership; that's the one org_id
      // change an org admin may make, and only within their own org.
      if (role === "user") updates.org_id = null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.User.update(userId, updates);

    // Revoking access has to retire their pending invitations too, or it only
    // holds until their next sign-in.
    //
    // acceptInvitation applies a pending invitation whenever the account has no
    // application role — which is exactly the state a revoke leaves behind. So a
    // live invitation for that address (an accidental re-invite, an older one
    // that was never accepted) would re-grant the role the moment they logged
    // in, while the roster went on showing No access. The revoke looked done and
    // wasn't.
    //
    // Service role because Invitation's own rules would let an org_admin edit
    // invitations outside their org; here the write is scoped to the address of
    // the user this call has already been authorised to revoke.
    let invitationsRevoked = 0;
    if (updates.role === "user") {
      const email = (updated.email || "").toLowerCase();
      if (email) {
        const pending = await base44.asServiceRole.entities.Invitation.filter({ status: "pending" }, null, 5000);
        for (const invitation of pending) {
          if ((invitation.email || "").toLowerCase() !== email) continue;
          await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: "revoked" });
          invitationsRevoked++;
        }
      }
    }

    return Response.json({
      invitationsRevoked,
      user: {
        id: updated.id,
        full_name: updated.full_name,
        email: updated.email,
        role: updated.role,
        org_id: updated.org_id || null,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
