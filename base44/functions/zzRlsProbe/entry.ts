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

    // ── Self-mutation probe ──────────────────────────────────────────────
    // User.update's RLS permits {"id": "{{user.id}}"} with no field-level
    // restriction, so in principle a user can rewrite their own record. If
    // they can set their own role or org_id, every boundary built on those
    // two fields is bypassable in a single API call.
    //
    // Each attempt is made AS THE CALLER (not service role), then the real
    // stored value is re-read via service role to see whether it actually
    // took, then reverted. The original values are restored in a finally
    // block regardless of what happens.
    const selfProbe = { skipped: null, attempts: [], restored: null };

    if (!user) {
      selfProbe.skipped = "unauthenticated";
    } else if (user.role === "admin") {
      // A super-admin is allowed to do all of this; testing proves nothing
      // and would briefly rewrite the owner's own account.
      selfProbe.skipped = "caller is super-admin; nothing to escalate";
    } else {
      const original = { role: user.role, org_id: user.org_id || null };

      // Pick a real org that is NOT the caller's, for the tenant-hop attempt.
      const orgs = await base44.asServiceRole.entities.Organization.list();
      const otherOrg = orgs.find((o) => !sameOrg(o.id, user.org_id));

      const attempt = async (label, patch) => {
        let rejected = false;
        let error = null;
        try {
          await base44.entities.User.update(user.id, patch);
        } catch (e) {
          rejected = true;
          error = e.message;
        }
        const after = await base44.asServiceRole.entities.User.get(user.id);
        const took = Object.keys(patch).every(
          (k) => (after[k] || null) === (patch[k] || null),
        );
        selfProbe.attempts.push({
          label,
          patch,
          rejected_by_api: rejected,
          error,
          value_actually_changed: took,
          verdict: took ? "VULNERABLE — the write stuck" : "blocked",
        });
        // Undo immediately, before the next attempt.
        await base44.asServiceRole.entities.User.update(user.id, original);
      };

      try {
        // 1. Can they change their own role at all (sideways, not upward)?
        const sideways = user.role === "facilitator" ? "org_admin" : "facilitator";
        await attempt("self role change (sideways)", { role: sideways });

        // 2. The real question: can they promote themselves to super-admin?
        await attempt("self role escalation to admin", { role: "admin" });

        // 3. Can they move themselves into another tenant? This one matters
        //    for the planned org-scoped read rules specifically.
        if (otherOrg) {
          await attempt("self org_id change (tenant hop)", { org_id: otherOrg.id });
        }
      } finally {
        await base44.asServiceRole.entities.User.update(user.id, original);
        const final = await base44.asServiceRole.entities.User.get(user.id);
        selfProbe.restored =
          final.role === original.role && (final.org_id || null) === original.org_id
            ? `yes — role=${final.role}, org_id=${final.org_id || null}`
            : `NO — MANUAL FIX NEEDED: role=${final.role}, org_id=${final.org_id || null}`;
      }
    }

    const anyVulnerable = selfProbe.attempts.some((a) => a.value_actually_changed);

    return Response.json({
      verdict: readError
        ? "ERROR — the RLS-scoped read threw"
        : anyVulnerable
          ? "VULNERABLE — read filtering is correct, but the caller can rewrite their own User record (see self_mutation)"
          : match
            ? "PASS — RLS enforced exactly as the rule specifies"
            : "FAIL — RLS did not filter as specified",
      self_mutation: selfProbe,
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
