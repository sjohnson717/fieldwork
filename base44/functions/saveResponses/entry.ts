import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Writing a respondent's answers, one survey page at a time.
//
// The survey used to write Response rows straight from the browser, and that
// only ever worked for a respondent's *first* pass over a page. Response's RLS
// permits `create` to anyone and restricts `update` to admin, org_admin and
// facilitator — and a respondent is none of those, because respondents have no
// accounts at all. Their URL token is the credential. So the moment a page was
// saved a second time, and the browser therefore held a row id and called
// update instead of create, the platform refused it and the survey showed
// "Error saving responses. Please try again." on a page whose answers were
// perfectly valid.
//
// That hit every way of revisiting an answer: paging Back and forward again,
// resuming from a saved link, and "Revise my answers" from the finished
// report. It was invisible in the data as an error and visible only as an
// absence — until this function existed, no Response row created by an
// anonymous respondent had ever had an updated_date later than its
// created_date.
//
// Opening Response.update to the world would have fixed the symptom by making
// anyone's answers editable by anyone, on an entity whose read rule is already
// open. Instead the write happens here: the token identifies the respondent,
// the service role does the writing, and the browser is never trusted with a
// row id at all — it sends answers keyed by activity, and the upsert below
// decides what is a create and what is an update.
//
// Runs unauthenticated by design, exactly like publicAssessment. The token IS
// the credential.

// The answers the survey can collect, and the values each one accepts.
//
// Validated here rather than trusted, because this endpoint is open: a caller
// with a token can reach it directly. Note that "I don't know" is accepted for
// execution even though Response's own enum omits it — the survey has always
// offered it, rows carrying it already exist, and self-gap scoring reads it as
// "no opinion" rather than a rating. Rejecting it here would refuse a real
// answer; adding it to the entity enum is a schema change and belongs with one.
const FIELDS = {
  importance: ["Not needed", "Nice to have", "Important", "Critical"],
  execution: ["Not done", "Inconsistent", "Good", "Excellent", "I don't know"],
  // Free text, chosen from the assessment's own roles or the job title list.
  // Checked for type and length only.
  suggested_owner: null,
  experience: ["None", "Limited", "Some", "Extensive"],
  skills: ["None", "Basic", "Good", "Excellent"],
  interest: ["None", "Limited", "Moderate", "Passionate"],
};

const TEAM_GAP_FIELDS = ["importance", "execution", "suggested_owner"];
const PERSONAL_FIELDS = ["experience", "skills", "interest"];

// One page of a long assessment is a handful of activities; the whole library
// is under a hundred. A cap keeps a single call from turning into a bulk write.
const MAX_ANSWERS = 200;

// The closing questions, asked once at the end of the survey and stored on
// Respondent rather than Response — they are about the instrument, not about
// any one activity. Admin-only: nothing here reaches a buyer report, a team
// leader dashboard or the discussion.
const FEEDBACK_FIELDS = ["closing_comments", "missing_coverage"];

// Long enough for a considered paragraph or three, short enough that this open
// endpoint cannot be used to park arbitrary data on a Respondent row.
const MAX_FEEDBACK = 2000;

// Explicit, because the platform's own default page size is not the app's to
// assume. A respondent has one row per activity, and an assessment's library is
// small — but "small enough that the default covered it" is how a silent
// truncation waits to happen.
const ALL = 5000;

const notFound = () =>
  // Uniform with publicAssessment: never reveal whether a token exists but is
  // the wrong kind, or belongs to an assessment that won't accept writes.
  Response.json({ error: "not_found" }, { status: 404 });

// The activities this assessment actually asks about — the same rule as
// getAssignedActivities on the client: library activities, filtered by
// activity_ids when that list is set, plus any custom activities belonging to
// this assessment.
const assignedIds = async (svc, assessment) => {
  const all = await svc.Activity.filter({ active: true }, "sort_order", ALL);
  const ids = assessment.activity_ids;
  const hasFilter = Array.isArray(ids) && ids.length > 0;
  const assigned = all.filter(
    (a) =>
      (!a.assessment_id && (!hasFilter || ids.includes(a.id))) ||
      a.assessment_id === assessment.id,
  );
  return new Set(assigned.map((a) => a.id));
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    const { token, answers, complete, feedback } = await req.json();
    if (!token || typeof token !== "string") {
      return Response.json({ error: "token is required" }, { status: 400 });
    }
    if (!Array.isArray(answers)) {
      return Response.json({ error: "answers must be an array" }, { status: 400 });
    }
    if (answers.length > MAX_ANSWERS) {
      return Response.json({ error: "too many answers" }, { status: 400 });
    }

    // Validated before anything is written, so a bad feedback payload fails the
    // whole call rather than leaving a page of answers saved beside a rejected
    // comment.
    const feedbackPayload = {};
    if (feedback !== undefined && feedback !== null) {
      if (typeof feedback !== "object" || Array.isArray(feedback)) {
        return Response.json({ error: "invalid feedback" }, { status: 400 });
      }
      for (const field of FEEDBACK_FIELDS) {
        const value = feedback[field];
        if (value === undefined) continue;
        if (value === null || value === "") {
          // Clearing is a real state: someone can revise their answers and
          // delete what they wrote, and an admin can clear a comment that
          // should not have been left.
          feedbackPayload[field] = null;
          continue;
        }
        if (typeof value !== "string") {
          return Response.json({ error: `invalid ${field}` }, { status: 400 });
        }
        const trimmed = value.trim();
        if (trimmed.length > MAX_FEEDBACK) {
          return Response.json({ error: `invalid ${field}` }, { status: 400 });
        }
        feedbackPayload[field] = trimmed || null;
      }
    }

    const respondents = await svc.Respondent.filter({ token }, null, ALL);
    const r = respondents?.[0];
    if (!r) return notFound();

    const assessment = await svc.Assessment.get(r.assessment_id);
    if (!assessment) return notFound();

    const isPersonal = assessment.assessment_type === "personal";

    // The same rule the survey applies before it lets anyone in, enforced
    // where it counts. A closed team assessment has had its aggregate
    // reported, and a late answer moves numbers already presented; a personal
    // assessment is the person's own and closing an engagement is not the
    // facilitator's reason to lock them out of it.
    if (assessment.status === "closed" && !isPersonal) {
      return Response.json({ error: "closed" }, { status: 409 });
    }

    const allowed = await assignedIds(svc, assessment);
    const writable = isPersonal ? PERSONAL_FIELDS : TEAM_GAP_FIELDS;

    // Only the fields this assessment type asks about are written. Sending the
    // other type's fields as null would be harmless on a fresh row but would
    // wipe real answers if an assessment's type were ever changed after
    // responses existed.
    const clean = [];
    for (const answer of answers) {
      const activityId = answer?.activity_id;
      if (!activityId || typeof activityId !== "string") {
        return Response.json({ error: "activity_id is required" }, { status: 400 });
      }
      // Silently skipped rather than rejected. An activity can leave an
      // assessment while someone is part-way through it — a library rebuild,
      // an edited activity set — and a respondent mid-survey should not be
      // stranded on an unsaveable page by an answer that now has nowhere to
      // go. It cannot be reported either way.
      if (!allowed.has(activityId)) continue;

      const payload = {};
      for (const field of writable) {
        const value = answer[field] ?? null;
        if (value === null || value === "") {
          // Unanswered stays unanswered, and clearing an answer is allowed:
          // both are real states of a survey page.
          payload[field] = null;
          continue;
        }
        if (typeof value !== "string") {
          return Response.json({ error: `invalid ${field}` }, { status: 400 });
        }
        const options = FIELDS[field];
        if (options && !options.includes(value)) {
          return Response.json({ error: `invalid ${field}` }, { status: 400 });
        }
        if (!options && value.length > 200) {
          return Response.json({ error: `invalid ${field}` }, { status: 400 });
        }
        payload[field] = value;
      }
      clean.push({ activityId, payload });
    }

    // One read, then one write per answer. Keyed by activity because that is
    // what the browser sends and what makes a row unique for a respondent;
    // should duplicates for one activity already exist, the first is the one
    // kept current rather than a second copy being added to the pile.
    const existing = await svc.Response.filter({ respondent_id: r.id }, null, ALL);
    const byActivity = new Map();
    for (const row of existing) {
      if (!byActivity.has(row.activity_id)) byActivity.set(row.activity_id, row);
    }

    let created = 0;
    let updated = 0;
    for (const { activityId, payload } of clean) {
      const row = byActivity.get(activityId);
      if (row) {
        await svc.Response.update(row.id, payload);
        updated++;
      } else {
        const made = await svc.Response.create({
          assessment_id: assessment.id,
          respondent_id: r.id,
          activity_id: activityId,
          ...payload,
        });
        // So two answers for the same activity in one call — which the survey
        // never sends, but a direct caller could — update rather than double.
        if (made) byActivity.set(activityId, made);
        created++;
      }
    }

    // Completion is part of the same call as the last page's answers. Held
    // apart, a respondent whose final save succeeded and whose status update
    // failed was left permanently "started" with a full set of answers, which
    // reads on the facilitator's roster as someone who never finished.
    //
    // The closing feedback rides along in the same update for the same reason,
    // though it never gates completion: it is asked on a page *after* the last
    // one that marks a respondent finished, and someone who closes the tab
    // rather than answering an optional question has still completed the
    // survey.
    const respondentPatch = { ...feedbackPayload };
    if (complete === true) {
      respondentPatch.status = "completed";
      respondentPatch.completed_date = new Date().toISOString();
    }
    if (Object.keys(respondentPatch).length > 0) {
      await svc.Respondent.update(r.id, respondentPatch);
    }

    return Response.json({ created, updated, skipped: answers.length - clean.length });
  } catch (e) {
    return Response.json({ error: e?.message || "save_failed" }, { status: 500 });
  }
});
