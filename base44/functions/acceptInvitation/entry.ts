import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Base44's users.inviteUser() only accepts its own PLATFORM roles — "user" and
// "admin". Our application roles (facilitator, org_admin) mean nothing to it,
// and passing one is rejected outright with:
//   Invalid role: "facilitator". Role must be either "user" or "admin".
//
// So the two are kept separate: everyone is invited at the platform level, and
// the intended application role travels on the Invitation record instead. This
// function applies it the first time the invited person signs in.
//
// It runs as service role because User.update's RLS only permits self-updates
// and super-admin writes — and we specifically do NOT want role assignment to
// be something a client can ask for. The caller never names a role or an org:
// both are read from a pending Invitation matched to the caller's own
// authenticated email address.
//
// The invitation is marked "accepted" once applied, so it is consumed exactly
// once. Without that, a stale pending invitation would silently re-promote
// someone on their next login after an admin had demoted them.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const email = (user.email || "").toLowerCase();
    if (!email) {
      return Response.json({ applied: false, reason: "no email on account" });
    }

    // Match on the caller's own email only — never on anything they supplied.
    const pending = await base44.asServiceRole.entities.Invitation.filter({
      status: "pending",
    });
    const mine = pending
      .filter((inv) => (inv.email || "").toLowerCase() === email)
      // Newest wins. An address can accumulate several pending invitations
      // (re-invited, or invited to a different org), and picking arbitrarily
      // would make the granted role non-deterministic — including the case
      // where an older "admin" invitation beats the intended one.
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));

    const invitation = mine[0];
    if (!invitation) {
      return Response.json({ applied: false, reason: "no pending invitation" });
    }

    // Supersede any older pending invitations for this address so they can
    // never be applied later.
    for (const stale of mine.slice(1)) {
      await base44.asServiceRole.entities.Invitation.update(stale.id, { status: "revoked" });
    }

    const updates: Record<string, unknown> = {};
    if (invitation.role && invitation.role !== "user") {
      updates.role = invitation.role;
    }
    if (invitation.org_id && !user.org_id) {
      updates.org_id = invitation.org_id;
    }

    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.User.update(user.id, updates);
    }

    // Consume it either way, so it cannot be applied a second time.
    await base44.asServiceRole.entities.Invitation.update(invitation.id, {
      status: "accepted",
    });

    return Response.json({ applied: Object.keys(updates).length > 0, updates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
