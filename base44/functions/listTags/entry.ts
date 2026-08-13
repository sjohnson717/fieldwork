import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Tags with a usage count, for the Tags settings page.
//
// The count is why this is a function. `tag_ids` lives on `Assessment`, whose
// read RLS scopes a facilitator to the engagements they run — so a count taken
// in the browser counts only the assessments the caller can see. That number
// would be wrong in the one direction that matters: a tag used exclusively by
// somebody else's engagement would read as "unused", and the page would offer
// to delete it. Counting as service role means "0 assessments" means nothing in
// the system uses it, not nothing you can see uses it.
//
// The count deliberately does not say *which* assessments. That would leak the
// titles of other organizations' engagements onto a settings page, which is the
// exact thing `Respondent` and `Assessment` reads go through functions to
// prevent. A number is enough to decide whether a tag is dead.
//
// Which tags come back mirrors Tag's own read rule: a super-admin sees all of
// them, anyone else sees the ones they created plus their organization's.

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
    const allowedRoles = ["admin", "org_admin", "facilitator"];
    if (!user || !allowedRoles.includes(user.role)) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;

    const [allTags, allAssessments] = await Promise.all([
      svc.Tag.list("name"),
      svc.Assessment.list(),
    ]);

    const usage = new Map<string, number>();
    for (const a of allAssessments) {
      for (const id of a.tag_ids || []) {
        usage.set(id, (usage.get(id) || 0) + 1);
      }
    }

    const visible = allTags.filter((t) =>
      user.role === "admin" ||
      t.created_by_id === user.id ||
      sameOrg(t.org_id, user.org_id)
    );

    return Response.json({
      tags: visible.map((t) => ({
        id: t.id,
        name: t.name,
        org_id: t.org_id || null,
        created_by_id: t.created_by_id || null,
        assessment_count: usage.get(t.id) || 0,
      })),
    });
  } catch (error) {
    console.error("listTags", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
