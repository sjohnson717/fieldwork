import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Folding one tag into another, then deleting the one folded away.
//
// deleteTag refuses a tag anything still uses, which is right — deleting a live
// grouping strips it from every assessment at once with nothing to show it
// existed. The consequence is that two tags meaning the same thing, "executive"
// typed twice, can only be reconciled by opening every assessment carrying the
// duplicate and swapping the chip by hand. That is the shape of a missing
// feature, and the Builder's data view is not the answer to it: nothing there
// checks references either.
//
// So: move every assessment off the source tag and onto the target, then delete
// the source. The rewrite runs as service role for the same reason listTags
// counts as service role — `tag_ids` sits on `Assessment`, whose read rule
// scopes a facilitator to their own engagements, so a browser-side rewrite
// would silently skip the assessments it cannot see and then fail the delete
// with a count it could not explain.
//
// Authority mirrors deleteTag's, and is required on *both* tags. Being allowed
// to remove the source says nothing about being allowed to put its assessments
// onto the target.
//
// The two must share an organization. Tags are org-scoped, so two tags with the
// same name in different organizations are not duplicates — they are two firms
// who happened to choose the same word, and merging them would move one firm's
// engagements onto the other's grouping. A super-admin sees every tag at once
// and is exactly the account most likely to mistake the one for the other,
// which is why this is enforced here rather than left to the picker.

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

    const { sourceTagId, targetTagId } = await req.json();
    if (!sourceTagId || !targetTagId) {
      return Response.json({ error: "sourceTagId and targetTagId are required" }, { status: 400 });
    }
    if (sourceTagId === targetTagId) {
      return Response.json({ error: "A tag cannot be merged into itself." }, { status: 400 });
    }

    const svc = base44.asServiceRole.entities;

    const [source, target] = await Promise.all([
      svc.Tag.get(sourceTagId),
      svc.Tag.get(targetTagId),
    ]);
    if (!source || !target) return Response.json({ error: "not_found" }, { status: 404 });

    const mayTouch = (tag) =>
      user.role === "admin" ||
      tag.created_by_id === user.id ||
      (user.role === "org_admin" && sameOrg(tag.org_id, user.org_id));

    // The uniform "not_found" the other gated functions return, so a refusal
    // cannot be used to learn that a tag exists in another organization.
    if (!mayTouch(source) || !mayTouch(target)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    if (!sameOrg(source.org_id, target.org_id)) {
      return Response.json({
        error: `${source.name} and ${target.name} belong to different organizations, so they are not duplicates. Rename one instead.`,
      }, { status: 409 });
    }

    // tag_ids is an array, which entity filters cannot search, so this is a
    // scan — the same one listTags and deleteTag do.
    const assessments = await svc.Assessment.list();
    const carrying = assessments.filter((a) => (a.tag_ids || []).includes(sourceTagId));

    // Rewritten one at a time rather than in parallel: a partial failure should
    // leave a prefix of assessments moved and the source tag still present and
    // still pointing at the rest, which is a re-runnable state. Firing them all
    // at once and deleting on Promise.all would delete after an unknown subset.
    let moved = 0;
    let alreadyHadTarget = 0;
    for (const a of carrying) {
      const ids = a.tag_ids || [];
      const hadTarget = ids.includes(targetTagId);
      // Set semantics: an assessment carrying both tags must end with one copy
      // of the target, not a duplicate id that renders as the same chip twice.
      const next = ids.filter((id) => id !== sourceTagId && id !== targetTagId);
      next.push(targetTagId);
      await svc.Assessment.update(a.id, { tag_ids: next });
      moved++;
      if (hadTarget) alreadyHadTarget++;
    }

    await svc.Tag.delete(sourceTagId);

    return Response.json({
      merged: {
        source: { id: sourceTagId, name: source.name },
        target: { id: targetTagId, name: target.name },
        assessmentsUpdated: moved,
        alreadyCarriedTarget: alreadyHadTarget,
      },
    });
  } catch (error) {
    console.error("mergeTag", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
