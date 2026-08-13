import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Usage counts for every library activity, in one call.
//
// The Activities tab needs these to know which rows can offer a Delete at all —
// the same reason listTags exists. Doing it per row would be twenty-six round
// trips on a tab that already loads slowly, and doing it in the browser would
// mean listing every Response in the system to count them, which is the largest
// table here by an order of magnitude.
//
// Returns counts keyed by activity id, and nothing else. Which assessments use
// an activity is not the Library's business — the Library is a catalogue, and
// naming client engagements in it would put another organization's data on a
// page that exists to edit question wording.
//
// Super-admin only, matching the Library's visibility.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let actor = null;
    try {
      actor = await base44.auth.me();
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!actor || actor.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;

    const [sets, assessments, responses, notes, flags] = await Promise.all([
      svc.ActivitySet.list(),
      svc.Assessment.list(),
      svc.Response.list(),
      svc.DiscussionNote.list(),
      svc.TeamLeaderFlag.list(),
    ]);

    const usage: Record<string, {
      assessments: number; sets: number; responses: number; notes: number; flags: number;
    }> = {};
    const bump = (id: string, key: "assessments" | "sets" | "responses" | "notes" | "flags") => {
      if (!id) return;
      usage[id] ||= { assessments: 0, sets: 0, responses: 0, notes: 0, flags: 0 };
      usage[id][key] += 1;
    };

    for (const a of assessments) for (const id of a.activity_ids || []) bump(id, "assessments");
    for (const s of sets) for (const id of s.activity_ids || []) bump(id, "sets");
    for (const r of responses) bump(r.activity_id, "responses");
    for (const n of notes) bump(n.activity_id, "notes");
    for (const f of flags) bump(f.activity_id, "flags");

    return Response.json({ usage });
  } catch (error) {
    console.error("listLibraryActivityUsage", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
