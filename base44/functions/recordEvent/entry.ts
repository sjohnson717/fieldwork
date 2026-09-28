import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Records something a respondent did with their report: came back to it, saved
// it as a PDF, followed a reading link, or followed one of the two offers.
//
// For the Results tabs' After finishing counts, which are totals only. Nothing
// here is ever shown against a name; the respondent id is on the row so that
// removing a respondent removes what they did, and so the counts can be of
// people rather than of clicks.
//
// Runs unauthenticated, like publicAssessment: the token is the credential,
// and a token that resolves to nobody records nothing. The event name is
// whitelisted and the detail capped, because an open endpoint that stored
// whatever it was sent would be a place to park anything.
//
// One row per person per event (per address, for reading links). Someone who
// taps Save as PDF three times has saved it once as far as the count is
// concerned, and the table stays the size of the audience rather than of
// their enthusiasm.

const EVENTS = ["report_reopened", "printed", "resource_clicked", "quartz_clicked", "chaos_clicked"];
const MAX_DETAIL = 300;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    const { token, event, detail } = await req.json();
    if (!token || typeof token !== "string" || !EVENTS.includes(event)) {
      return Response.json({ error: "token and a known event are required" }, { status: 400 });
    }

    const respondents = await svc.Respondent.filter({ token });
    const r = respondents?.[0];
    if (!r) return Response.json({ error: "not_found" }, { status: 404 });

    const cleanDetail = event === "resource_clicked" && typeof detail === "string"
      ? detail.trim().slice(0, MAX_DETAIL)
      : "";

    const existing = await svc.RespondentEvent.filter({ respondent_id: r.id, event, detail: cleanDetail });
    if (existing?.length) return Response.json({ recorded: false });

    await svc.RespondentEvent.create({
      assessment_id: r.assessment_id,
      respondent_id: r.id,
      event,
      detail: cleanDetail,
    });
    return Response.json({ recorded: true });
  } catch (error) {
    console.error("recordEvent", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
