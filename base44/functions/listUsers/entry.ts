import { createClientFromRequest } from "npm:@base44/sdk";

// The built-in User entity ignores custom RLS rules for list operations
// (regular tokens only ever get their own record back, regardless of what
// User.jsonc's "read" rule says) — confirmed directly by Base44 support.
// This function is the supported workaround: gate access ourselves, then
// use the service role to actually list users, bypassing entity RLS.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || (user.role !== "admin" && user.role !== "facilitator")) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allUsers = await base44.asServiceRole.entities.User.list();
    const users = allUsers
      .filter((u) => u.role === "admin" || u.role === "facilitator")
      .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role }));

    return Response.json({ users });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
