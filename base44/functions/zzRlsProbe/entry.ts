import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// ─────────────────────────────────────────────────────────────────────────────
// THROWAWAY DIAGNOSTIC — DELETE THIS ENTIRE FOLDER AFTER THE SPIKE.
// Also delete: the ZZ_RlsSpike entity (Base44 console) and the /zz-rls-probe
// route + page in the app.
//
// Purpose: prove that Base44 actually ENFORCES the RLS rule shapes we plan to
// rely on. The MCP tooling runs as service role and bypasses RLS, so it can
// only confirm the syntax is accepted, not that it filters correctly.
//
// ZZ_RlsSpike carries this read rule:
//   $or: [ admin,
//          $and: [ org_admin, data.org_id == {{user.data.org_id}} ],
//          data.member_ids contains {{user.id}} ]
//
// This function reads the entity TWICE — once as the calling user (subject to
// RLS) and once as service role (ground truth) — then compares what RLS let
// through against what the rule says should have come through.
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      // Unauthenticated is a valid thing to probe: expect zero rows.
    }

    // Ground truth: every row that exists, ignoring RLS.
    const allRows = await base44.asServiceRole.entities.ZZ_RlsSpike.list();

    // What RLS actually lets this caller see.
    let visibleRows = [];
    let readError = null;
    try {
      visibleRows = await base44.entities.ZZ_RlsSpike.list();
    } catch (e) {
      readError = e.message;
    }

    // What the rule SAYS this caller should see.
    const sameOrg = (a, b) => (a || null) === (b || null);
    const shouldSee = (row) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (user.role === "org_admin" && sameOrg(row.org_id, user.org_id)) return true;
      return (row.member_ids || []).includes(user.id);
    };

    const expected = allRows.filter(shouldSee).map((r) => r.label).sort();
    const actual = visibleRows.map((r) => r.label).sort();
    const match = JSON.stringify(expected) === JSON.stringify(actual);

    return Response.json({
      verdict: readError
        ? "ERROR — the RLS-scoped read threw"
        : match
          ? "PASS — RLS enforced exactly as the rule specifies"
          : "FAIL — RLS did not filter as specified",
      caller: user
        ? { id: user.id, email: user.email, role: user.role, org_id: user.org_id || null }
        : "unauthenticated",
      expected_labels: expected,
      actual_labels: actual,
      total_rows_that_exist: allRows.length,
      read_error: readError,
      // Which clause each row was expected to match, to localise a failure.
      rule_trace: allRows.map((r) => ({
        label: r.label,
        matches_admin: user?.role === "admin",
        matches_org_clause: user?.role === "org_admin" && sameOrg(r.org_id, user?.org_id),
        matches_member_clause: (r.member_ids || []).includes(user?.id),
      })),
    });
  } catch (error) {
    return Response.json({ verdict: "ERROR", error: error.message }, { status: 500 });
  }
});
