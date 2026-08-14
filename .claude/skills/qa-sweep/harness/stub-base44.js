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

import { ACTIVITIES, TEAM_GAP, PERSONAL, RESPONDENTS, ALL_ANSWERS, OWN_ANSWERS, PERSONAL_ANSWERS, DISCUSSION_NOTES, TEAM_TOKEN, BUYER_TOKEN } from "./fixtures.js";

const ANSWER_FIELDS = ["importance", "execution", "suggested_owner", "experience", "skills", "interest"];

const state = {
  assessments: [
    { ...TEAM_GAP, team_token: TEAM_TOKEN, buyer_token: BUYER_TOKEN },
    { ...PERSONAL, team_token: TEAM_TOKEN + "-P", buyer_token: BUYER_TOKEN + "-P" },
  ],
  respondents: RESPONDENTS.map(r => ({ ...r, assessment_id: TEAM_GAP.id })),
  responses: ALL_ANSWERS.map((a, i) => ({ id: `row-${i}`, assessment_id: TEAM_GAP.id, ...a })),
  notes: DISCUSSION_NOTES.map(n => ({ ...n })),
  flags: [],
  calls: [],
  violations: [],
};

// A respondent whose own answers are the awkward set, for the resume and revise
// flows. Keyed by token so the driver can point a URL at it.
state.responses.push(
  ...OWN_ANSWERS.map((a, i) => ({ id: `own-${i}`, assessment_id: TEAM_GAP.id, respondent_id: "resp-1", ...a })),
);
const personalRespondent = { id: "resp-p1", assessment_id: PERSONAL.id, name: "Jo Marsden", title: "Product Manager", token: "TOKEN-PERSONAL", status: "completed", completed_date: "2026-08-13T09:00:00.000Z", created_date: "2026-08-12T09:00:00.000Z" };
state.respondents.push(personalRespondent);
state.responses.push(...PERSONAL_ANSWERS.map((a, i) => ({ id: `pers-${i}`, assessment_id: PERSONAL.id, respondent_id: personalRespondent.id, ...a })));

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
    Activity: { filter: async () => readOnly(ACTIVITIES) },
    JobTitle: { filter: async () => [{ name: "Product Management" }, { name: "Product Marketing" }, { name: "Engineering" }, { name: "Design" }] },
    Resource: { filter: async () => [] },
    Organization: { filter: async () => [{ id: "org-1", name: "Product Growth Leaders" }] },
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
              respondent: { id: r.id, name: r.name, title: r.title || null, status: r.status, completed_date: r.completed_date || null },
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
                .map(r => ({ respondent_id: r.respondent_id, activity_id: r.activity_id, importance: r.importance ?? null, execution: r.execution ?? null, suggested_owner: r.suggested_owner ?? null })),
            },
          };
        }
        return notFound();
      }

      if (name === "saveResponses") {
        const { token, answers, complete } = body;
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
        if (complete === true) { r.status = "completed"; r.completed_date = new Date().toISOString(); }
        return { data: { created, updated, skipped: 0 } };
      }

      if (name === "listRespondents") {
        return { data: { respondents: readOnly(state.respondents) } };
      }

      throw new Error(`QA stub: unhandled function "${name}"`);
    },
  },
};
