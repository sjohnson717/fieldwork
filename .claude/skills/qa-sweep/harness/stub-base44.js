// The backend, stubbed, aliased over @/api/base44Client.
//
// Two rules make this useful rather than merely convenient:
//
// 1. It enforces the app's real RLS. Response.update and Response.delete throw
//    403 the way the platform does for an anonymous respondent, and direct reads
//    of Response throw too. Anything that regresses to writing or reading that
//    entity from the browser fails here instead of passing QA and breaking in
//    production — which is exactly how the "Error saving responses" bug shipped.
//
// 2. Writes land in module state and reads come back from it, so a flow can be
//    asserted end to end: save a page, page back, change an answer, save again,
//    and check that one row changed rather than two rows existing.
//
// window.__qa exposes that state to the driver.

import { FACETS, ACTIVITIES, TEAM_GAP, PERSONAL, RESPONDENTS, ALL_ANSWERS, OWN_ANSWERS, PERSONAL_ANSWERS, DISCUSSION_NOTES, TEAM_TOKEN, BUYER_TOKEN,
         CHAOS, CHAOS_QUESTIONS, CHAOS_RESPONDENTS, CHAOS_ANSWERS, CHAOS_BUYER_TOKEN } from "./fixtures.js";

// Mirrors publicAssessment's own list. The buyer payload used to name the team
// gap's three fields inline, exactly as the real function did — which is why a
// Chaos report shipped with every bar empty and "1 didn't answer this" under a
// header saying somebody had finished. The stub is only useful while it is
// wrong in the same ways the backend is.
const ANSWER_FIELDS = ["importance", "execution", "suggested_owner", "experience", "skills", "interest", "answer", "answer_text"];

const state = {
  assessments: [
    { ...TEAM_GAP, team_token: TEAM_TOKEN, buyer_token: BUYER_TOKEN, tag_ids: ["tag-1"] },
    { ...PERSONAL, team_token: TEAM_TOKEN + "-P", buyer_token: BUYER_TOKEN + "-P" },
    { ...CHAOS, buyer_token: CHAOS_BUYER_TOKEN },
  ],
  respondents: RESPONDENTS.map(r => ({ ...r, assessment_id: TEAM_GAP.id })),
  responses: ALL_ANSWERS.map((a, i) => ({ id: `row-${i}`, assessment_id: TEAM_GAP.id, ...a })),
  notes: DISCUSSION_NOTES.map(n => ({ ...n })),
  // One tag, on the gap assessment only, so the admin sidebar exercises both
  // the chip on a tagged row and the absence of one on an untagged row.
  tags: [{ id: "tag-1", name: "Northwind Systems" }],
  flags: [],
  calls: [],
  violations: [],
  // The two library instruments as records. The fixtures' assessments stay on
  // assessment_type with no instrument_id, which is what every assessment made
  // before instruments existed looks like — so these routes go on exercising
  // the fallback path rather than quietly testing only the new one.
  instruments: [
    { id: "inst-team", key: "team_gap", name: "Team gap analysis", question_source: "library",
      report_style: "gap", ask_ownership: true, scale_ids: ["sc-imp", "sc-exec"],
      sections: FACETS, sort_order: 1, active: true,
      tagline: "Where the work matters more than it is being done",
      description: "A team rates every activity on how much it matters and how well it is done today." },
    { id: "inst-personal", key: "personal", name: "Personal assessment", question_source: "library",
      report_style: "profile", ask_ownership: false, scale_ids: ["sc-exp", "sc-skill", "sc-int"],
      sections: FACETS, sort_order: 2, active: true,
      tagline: "What one person brings to the same activities",
      description: "An individual rates their own experience, skills and interest in each activity." },
    { id: "inst-chaos", key: "chaos", name: "Chaos Assessment", question_source: "instrument",
      report_style: "distribution", ask_ownership: false, scale_ids: ["sc-challenge"],
      sections: ["Your Challenges", "Comments"], sort_order: 3, active: true,
      tagline: "Find out which obstacles are preventing product success",
      description: "What really prevents you from defining, developing, and delivering products people want?" },
  ],
  scales: [
    { id: "sc-imp", key: "importance", name: "Importance", sort_order: 0 },
    { id: "sc-exec", key: "execution", name: "Current execution", unknown_label: "I don't know", unknown_treatment: "excluded", sort_order: 1 },
    { id: "sc-exp", key: "experience", name: "Experience", sort_order: 2 },
    { id: "sc-skill", key: "skills", name: "Skills", sort_order: 3 },
    { id: "sc-int", key: "interest", name: "Interest", sort_order: 4 },
    { id: "sc-challenge", key: "challenge", name: "Challenge scale", sort_order: 5 },
  ],
  // The real option sets, so the survey rendered from Scale records is the one
  // the sweep actually checks. Left empty, every axis would fall back to the
  // module constants and this migration would pass untested.
  scaleOptions: [
    ...["Not needed", "Nice to have", "Important", "Critical"].map((label, i) => ({ id: `o-imp-${i}`, scale_id: "sc-imp", label, points: i, sort_order: i })),
    ...["Not done", "Inconsistent", "Good", "Excellent"].map((label, i) => ({ id: `o-exec-${i}`, scale_id: "sc-exec", label, points: i, sort_order: i })),
    { id: "o-exec-4", scale_id: "sc-exec", label: "I don't know", points: null, sort_order: 4 },
    ...["None", "Limited", "Some", "Extensive"].map((label, i) => ({ id: `o-exp-${i}`, scale_id: "sc-exp", label, points: [0,1,3,5][i], sort_order: i })),
    ...["None", "Basic", "Good", "Excellent"].map((label, i) => ({ id: `o-skill-${i}`, scale_id: "sc-skill", label, points: [0,1,3,5][i], sort_order: i })),
    ...["None", "Limited", "Moderate", "Passionate"].map((label, i) => ({ id: `o-int-${i}`, scale_id: "sc-int", label, points: [0,1,3,5][i], sort_order: i })),
    ...["Absolutely", "Somewhat", "Not so much", "Never"].map((label, i) => ({ id: `o-ch-${i}`, scale_id: "sc-challenge", label, points: [1,3,5,8][i], sort_order: i })),
  ],
};

// A respondent whose own answers are the awkward set, for the resume and revise
// flows. Keyed by token so the driver can point a URL at it.
state.responses.push(
  ...OWN_ANSWERS.map((a, i) => ({ id: `own-${i}`, assessment_id: TEAM_GAP.id, respondent_id: "resp-1", ...a })),
);
const personalRespondent = { id: "resp-p1", assessment_id: PERSONAL.id, name: "Jo Marsden", title: "Product Manager", token: "TOKEN-PERSONAL", status: "completed", completed_date: "2026-08-13T09:00:00.000Z", created_date: "2026-08-12T09:00:00.000Z" };
state.respondents.push(personalRespondent);
state.responses.push(...PERSONAL_ANSWERS.map((a, i) => ({ id: `pers-${i}`, assessment_id: PERSONAL.id, respondent_id: personalRespondent.id, ...a })));

state.respondents.push(...CHAOS_RESPONDENTS.map(r => ({ ...r })));
state.responses.push(...CHAOS_ANSWERS.map((a, i) => ({ id: `chaos-${i}`, assessment_id: CHAOS.id, ...a })));

if (typeof window !== "undefined") {
  window.__qa = state;
  window.__qaReset = () => { state.calls.length = 0; state.violations.length = 0; };
}

const log = (name, payload) => state.calls.push({ name, payload, at: Date.now() });
const forbid = (what) => {
  // Recorded as well as thrown: a page that swallows the error still leaves
  // evidence that it asked for something it is not allowed to have.
  state.violations.push(what);
  const e = new Error(`403 RLS: ${what} is not permitted for this caller`);
  e.status = 403;
  e.response = { status: 403, data: { error: "forbidden" } };
  throw e;
};

const answerFieldsOf = (row) => Object.fromEntries(ANSWER_FIELDS.map(f => [f, row[f] ?? null]));
const ownRowsFor = (respondentId) =>
  state.responses.filter(r => r.respondent_id === respondentId).map(r => ({ activity_id: r.activity_id, ...answerFieldsOf(r) }));

const readOnly = (rows) => rows.map(r => ({ ...r }));

export const base44 = {
  auth: {
    // Overridden per run by the driver when a staff role is wanted; anonymous
    // by default, which is what every public route sees.
    me: async () => (state.user ? { ...state.user } : Promise.reject(new Error("not authenticated"))),
  },
  entities: {
    // `list` as well as `filter`: the admin sidebar counts each instrument's
    // questions from the whole table rather than trusting a stored count.
    Activity: { filter: async () => readOnly([...ACTIVITIES, ...CHAOS_QUESTIONS]), list: async () => readOnly([...ACTIVITIES, ...CHAOS_QUESTIONS]) },
    JobTitle: { filter: async () => [{ name: "Product Management" }, { name: "Product Marketing" }, { name: "Engineering" }, { name: "Design" }] },
    Resource: { filter: async () => [] },
    // Admin reads these two directly. The sweep's own routes are public and
    // reach an assessment through publicAssessment, so the stub went without
    // them for a long time — which meant /admin threw on mount and no admin
    // page could be checked at all, including the two results tabs that hold
    // every respondent's answers.
    Tag: { list: async () => readOnly(state.tags) },
    Assessment: {
      // Staff-only, like Response.list: an anonymous caller must never be able
      // to enumerate assessments and read their access codes and tokens.
      list: async () => (state.user ? readOnly(state.assessments) : forbid("Assessment.list")),
      get: async (id) => {
        if (!state.user) return forbid("Assessment.get");
        const found = state.assessments.find(a => a.id === id);
        return found ? { ...found } : Promise.reject(new Error("not found"));
      },
      update: async (id, patch) => {
        if (!state.user) return forbid("Assessment.update");
        const row = state.assessments.find(a => a.id === id);
        Object.assign(row, patch);
        log("Assessment.update", patch);
        return { ...row };
      },
    },
    // `list` as well as `filter`: the admin sidebar groups assessments by
    // organization and owner, and reads the whole table to name them. Without
    // it that load threw, was caught, and logged a console error on every admin
    // route — a gate finding that was the stub's gap, not the app's.
    Organization: {
      filter: async () => [{ id: "org-1", name: "Product Growth Leaders" }],
      list: async () => [
        { id: "org-1", name: "Product Growth Leaders" },
        { id: "org-2", name: "Northwind Advisory" },
      ],
    },
    // The two library instruments. Enough for the admin page to name them, to
    // decide an assessment's tabs, and to badge it — the four that carry their
    // own questions have their own fixtures when a route needs them.
    Instrument: {
      list: async () => readOnly(state.instruments || []),
      filter: async (q = {}) =>
        readOnly((state.instruments || []).filter(i => Object.entries(q).every(([k, v]) => i[k] === v))),
    },
    Scale: { list: async () => readOnly(state.scales || []) },
    ScaleOption: { list: async () => readOnly(state.scaleOptions || []) },
    Band: { filter: async () => [] },
    DiscussionNote: { filter: async () => readOnly(state.notes) },
    TeamLeaderFlag: {
      filter: async () => readOnly(state.flags),
      create: async (p) => { const made = { id: `flag-${state.flags.length}`, ...p }; state.flags.push(made); log("TeamLeaderFlag.create", p); return { ...made }; },
      update: async (id, p) => { const row = state.flags.find(f => f.id === id); Object.assign(row, p); log("TeamLeaderFlag.update", p); return { ...row }; },
    },
    Response: {
      // Staff-only under the tightened rule. Anonymous pages must get answers
      // from publicAssessment instead.
      list: async () => (state.user ? readOnly(state.responses) : forbid("Response.list")),
      filter: async (q) => {
        if (!state.user) return forbid("Response.filter");
        return readOnly(state.responses.filter(r => Object.entries(q || {}).every(([k, v]) => r[k] === v)));
      },
      create: async () => forbid("Response.create from the browser (use saveResponses)"),
      update: async () => forbid("Response.update"),
      delete: async (id) => {
        if (!state.user) return forbid("Response.delete");
        state.responses = state.responses.filter(r => r.id !== id);
        log("Response.delete", id);
      },
    },
    Respondent: {
      filter: async (q) => readOnly(state.respondents.filter(r => Object.entries(q || {}).every(([k, v]) => r[k] === v))),
      create: async (p) => {
        const made = { id: `resp-new-${state.respondents.length}`, status: "started", created_date: new Date().toISOString(), ...p };
        state.respondents.push(made);
        log("Respondent.create", p);
        return { ...made };
      },
      update: async (id, p) => {
        const row = state.respondents.find(r => r.id === id);
        if (row) Object.assign(row, p);
        log("Respondent.update", { id, ...p });
        return { ...row };
      },
      delete: async (id) => { state.respondents = state.respondents.filter(r => r.id !== id); log("Respondent.delete", id); },
    },
  },
  functions: {
    invoke: async (name, body) => {
      log(`fn:${name}`, body);
      const notFound = () => { const e = new Error("not_found"); e.status = 404; e.response = { status: 404 }; throw e; };

      if (name === "publicAssessment") {
        const { mode, token } = body;
        if (mode === "code") {
          const a = state.assessments.find(x => (x.access_code || "").toUpperCase() === String(token).toUpperCase());
          return a ? { data: { assessment: { ...a, access_code: undefined } } } : notFound();
        }
        if (mode === "respondent") {
          const r = state.respondents.find(x => x.token === token);
          if (!r) return notFound();
          const a = state.assessments.find(x => x.id === r.assessment_id);
          return {
            data: {
              assessment: a,
              // The wrap-up fields travel on this mode and no other, which is
              // what keeps the survey's free text out of the team and buyer
              // shapes below. Mirrored here so the sweep fails if that ever
              // stops being true.
              respondent: {
                id: r.id, name: r.name, title: r.title || null, status: r.status,
                completed_date: r.completed_date || null,
                closing_comments: r.closing_comments || null,
                missing_coverage: r.missing_coverage || null,
              },
              responses: ownRowsFor(r.id),
            },
          };
        }
        if (mode === "team") {
          const a = state.assessments.find(x => x.team_token === token);
          if (!a) return notFound();
          const mine = state.respondents.filter(r => r.assessment_id === a.id);
          const counts = {};
          for (const row of state.responses) {
            if (ANSWER_FIELDS.some(f => row[f])) counts[row.respondent_id] = (counts[row.respondent_id] || 0) + 1;
          }
          const withholdTokens = a.assessment_type === "personal";
          return {
            data: {
              assessment: a,
              respondents: mine.map(r => ({
                id: r.id, name: r.name, title: r.title || null, status: r.status,
                ...(withholdTokens ? {} : { token: r.token }),
                answer_count: counts[r.id] || 0, completed_date: r.completed_date || null, created_date: r.created_date,
              })),
              linked: [],
            },
          };
        }
        if (mode === "buyer") {
          const a = state.assessments.find(x => x.buyer_token === token);
          if (!a) return notFound();
          const mine = state.respondents.filter(r => r.assessment_id === a.id);
          return {
            data: {
              assessment: a,
              respondents: mine.map(r => ({ id: r.id, status: r.status })),
              responses: state.responses
                .filter(r => r.assessment_id === a.id)
                .map(r => ({ respondent_id: r.respondent_id, activity_id: r.activity_id, ...answerFieldsOf(r) })),
            },
          };
        }
        return notFound();
      }

      if (name === "saveResponses") {
        const { token, answers, complete, feedback } = body;
        const r = state.respondents.find(x => x.token === token);
        if (!r) return notFound();
        if (!Array.isArray(answers)) { const e = new Error("answers must be an array"); e.status = 400; throw e; }
        let created = 0, updated = 0;
        for (const answer of answers) {
          const { activity_id, ...fields } = answer;
          if (!ACTIVITIES.some(a => a.id === activity_id)) continue;
          const existing = state.responses.find(row => row.respondent_id === r.id && row.activity_id === activity_id);
          if (existing) { Object.assign(existing, fields); existing.updated = true; updated++; }
          else { state.responses.push({ id: `new-${state.responses.length}`, assessment_id: r.assessment_id, respondent_id: r.id, activity_id, ...fields }); created++; }
        }
        // The wrap-up's free text, validated the way the real function does:
        // trimmed, capped, and empty meaning "cleared" rather than "unchanged".
        if (feedback !== undefined && feedback !== null) {
          if (typeof feedback !== "object" || Array.isArray(feedback)) { const e = new Error("invalid feedback"); e.status = 400; throw e; }
          for (const field of ["closing_comments", "missing_coverage"]) {
            const value = feedback[field];
            if (value === undefined) continue;
            if (value === null || value === "") { r[field] = null; continue; }
            if (typeof value !== "string") { const e = new Error(`invalid ${field}`); e.status = 400; throw e; }
            const trimmed = value.trim();
            if (trimmed.length > 2000) { const e = new Error(`invalid ${field}`); e.status = 400; throw e; }
            r[field] = trimmed || null;
          }
        }
        if (complete === true) { r.status = "completed"; r.completed_date = new Date().toISOString(); }
        return { data: { created, updated, skipped: 0 } };
      }

      if (name === "listRespondents") {
        return { data: { respondents: readOnly(state.respondents) } };
      }

      // Called by AssessmentOverview on mount. Without it every admin route
      // reported a console error that belonged to the harness, not the app —
      // which is the kind of finding that teaches people to ignore findings.
      if (name === "listUsers") {
        if (!state.user) return forbid("listUsers");
        return { data: { users: [
          { id: "user-1", email: "qa@example.com", full_name: "QA Admin", role: "admin", org_id: "org-1" },
          { id: "user-2", email: "facilitator@example.com", full_name: "Sam Facilitator", role: "facilitator", org_id: "org-1" },
        ] } };
      }

      throw new Error(`QA stub: unhandled function "${name}"`);
    },
  },
};
