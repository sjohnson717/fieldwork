import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Respondent progress for every assessment the caller can see, in one call.
//
// The Assessments home page shows a Responses column and an unread badge on
// each row. Getting those through listRespondents would be one round trip per
// assessment — fine for a consultant with four, not for a super-admin with a
// hundred — and Respondent.read is super-admin only, so the browser cannot
// count them itself.
//
// Returns counts and completion timestamps keyed by assessment id, and nothing
// else. No names, job titles or free text: those stay behind listRespondents,
// which is opened one assessment at a time. The timestamps are what let the
// browser decide which completions are new to *this* user without the server
// having to know what they last looked at.
//
// Access mirrors listRespondents clause for clause, applied to every
// assessment rather than one.

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

    const svc = base44.asServiceRole.entities;
    const [assessments, respondents] = await Promise.all([
      svc.Assessment.list(),
      svc.Respondent.list(),
    ]);

    const allowed = new Set(
      assessments
        .filter((a) =>
          user.role === "admin" ||
          a.created_by_id === user.id ||
          (a.collaborator_ids || []).includes(user.id) ||
          (user.role === "org_admin" && sameOrg(a.org_id, user.org_id))
        )
        .map((a) => a.id),
    );

    const summary: Record<string, {
      started: number; completed: number; completed_dates: string[]; last_activity: string | null;
    }> = {};
    for (const id of allowed) {
      summary[id] = { started: 0, completed: 0, completed_dates: [], last_activity: null };
    }

    for (const r of respondents) {
      const s = summary[r.assessment_id];
      if (!s) continue;
      // A respondent who finished carries completed_date; one who has only
      // signed in does not. Rows from before completed_date existed fall back
      // to updated_date, which is when the completion flag was written.
      const done = r.status === "completed";
      const when = done ? (r.completed_date || r.updated_date) : (r.updated_date || r.created_date);
      if (done) {
        s.completed += 1;
        if (when) s.completed_dates.push(when);
      } else {
        s.started += 1;
      }
      if (when && (!s.last_activity || when > s.last_activity)) s.last_activity = when;
    }

    return Response.json({ summary });
  } catch (error) {
    console.error("summarizeRespondents", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
