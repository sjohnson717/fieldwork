import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Deleting a tag nothing uses any more.
//
// Same shape as deleteOrganization: the platform would allow this from the
// browser — Tag's delete rule covers a super-admin, the tag's creator, and an
// org admin within their own org — and the check is the reason to route it here
// anyway. `Assessment.tag_ids` is an array of plain id strings that nothing
// enforces, so deleting a tag still in use leaves those ids pointing at a row
// that is gone. TagPicker survives that (`selected` drops ids it cannot
// resolve), which makes the damage quiet rather than harmless: the grouping
// disappears from every assessment at once, with nothing to show it ever
// existed and no way back.
//
// So a tag is deletable exactly when no assessment references it, counted as
// service role — including assessments the caller cannot read. A facilitator
// scoped to their own engagements must not be able to delete a grouping that
// another consultant's client relies on, and without the service-role count
// they would look identical to a genuinely unused tag.
//
// Authority mirrors the entity's rule rather than the count's breadth: seeing
// that a tag is unused is not the same as being allowed to remove it.

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

    const { tagId } = await req.json();
    if (!tagId) {
      return Response.json({ error: "tagId is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;

    const tag = await svc.Tag.get(tagId);
    if (!tag) return Response.json({ error: "not_found" }, { status: 404 });

    const allowed =
      user.role === "admin" ||
      tag.created_by_id === user.id ||
      (user.role === "org_admin" && sameOrg(tag.org_id, user.org_id));

    // The same uniform "not_found" the other gated functions return, so the
    // error cannot be used to learn that a tag exists in another org.
    if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });

    // tag_ids is an array, which entity filters cannot search, so this is a
    // scan — the same one listTags does to build its counts.
    const assessments = await svc.Assessment.list();
    const inUse = assessments.filter((a) => (a.tag_ids || []).includes(tagId));

    if (inUse.length) {
      return Response.json({
        error: `${tag.name} is still on ${inUse.length} assessment${inUse.length === 1 ? "" : "s"}. Remove it from them first, then delete the tag.`,
        blockers: { assessments: inUse.length },
      }, { status: 409 });
    }

    await svc.Tag.delete(tagId);

    return Response.json({ deleted: { id: tagId, name: tag.name } });
  } catch (error) {
    console.error("deleteTag", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
