import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// The built-in User entity ignores custom RLS rules for list operations
// (regular tokens only ever get their own record back, regardless of what
// User.jsonc's "read" rule says) — confirmed directly by Base44 support.
// This function is the supported workaround: gate access ourselves, then
// use the service role to actually list users, bypassing entity RLS.
//
// Org scoping: admins (super-admin) see everyone. org_admins and
// facilitators only see others in their own org_id — treating
// absent/null org_id as its own shared "no org" bucket, so existing
// accounts created before Organizations existed keep working unchanged.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    const allowedRoles = ["admin", "org_admin", "facilitator"];
    if (!user || !allowedRoles.includes(user.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const sameOrg = (a, b) => (a || null) === (b || null);

    const users = allUsers
      .filter((u) => allowedRoles.includes(u.role))
      .filter((u) => user.role === "admin" || sameOrg(u.org_id, user.org_id))
      .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role, org_id: u.org_id || null }));

    return Response.json({ users });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
