import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// Token resolution for the three unauthenticated flows: /assess, /team/:token
// and /report/:token.
//
// Each of those pages used to call Assessment.list() and match a token
// client-side. That required Assessment.read to stay open to the world, which
// meant anyone could list every assessment in the app and read the
// access_code, team_token and buyer_token straight off each record. The
// "unguessable URL" design was defeated not by weak tokens but by the tokens
// being enumerable.
//
// This resolves the token with the service role instead, and — just as
// importantly — returns only the fields the calling flow legitimately needs.
// A team leader never receives the buyer's report token, a buyer never
// receives the access code, and a respondent receives no tokens at all.
//
// Runs unauthenticated by design; the token IS the credential.

// Everything the three public pages actually render. Notably absent:
// access_code, buyer_token and team_token — those are credentials, and only
// the "team" mode gets access_code because it builds respondent links.
const PUBLIC_FIELDS = [
  "id",
  "title",
  "assessment_type",
  "tagline",
  "company_name",
  "status",
  "roles",
  "activity_ids",
  "created_date",
];

const shape = (assessment, extraFields = []) => {
  const out = {};
  for (const f of [...PUBLIC_FIELDS, ...extraFields]) out[f] = assessment[f] ?? null;
  return out;
};

const notFound = () =>
  // Deliberately uniform: never reveal whether a token exists but is the wrong
  // kind, or belongs to a closed assessment.
  Response.json({ error: "not_found" }, { status: 404 });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole.entities;

    const { mode, token } = await req.json();
    if (!mode || !token || typeof token !== "string") {
      return Response.json({ error: "mode and token are required" }, { status: 400 });
    }

    const assessments = await svc.Assessment.list();

    switch (mode) {
      // Respondent entering an access code on /assess.
      case "code": {
        const wanted = token.trim().toUpperCase();
        const a = assessments.find((x) => (x.access_code || "").toUpperCase() === wanted);
        if (!a) return notFound();
        return Response.json({ assessment: shape(a) });
      }

      // Respondent returning via their personal ?t= link.
      case "respondent": {
        const respondents = await svc.Respondent.filter({ token });
        const r = respondents?.[0];
        if (!r) return notFound();
        const a = assessments.find((x) => x.id === r.assessment_id);
        if (!a) return notFound();
        return Response.json({
          assessment: shape(a),
          respondent: {
            id: r.id,
            name: r.name,
            title: r.title || null,
            status: r.status,
            // Dates the printed copy of their answers, so it reads as a record
            // of what they submitted and when.
            completed_date: r.completed_date || null,
          },
        });
      }

      // Team leader dashboard. Needs access_code so it can build the
      // /assess?code=…&t=… links it hands out to team members.
      case "team": {
        const a = assessments.find((x) => x.team_token && x.team_token === token);
        if (!a) return notFound();
        const [respondents, responses] = await Promise.all([
          svc.Respondent.filter({ assessment_id: a.id }),
          svc.Response.filter({ assessment_id: a.id }),
        ]);
        // Answer counts distinguish "signed in but hasn't answered anything"
        // from "actually working through it". Derived rather than stored, so
        // it cannot drift out of step with the responses themselves.
        // Counts whichever fields this assessment's type asks about — a
        // personal assessment stores nothing in importance/execution, so
        // checking only those would report every respondent as untouched.
        const ANSWER_FIELDS = ["importance", "execution", "suggested_owner", "experience", "skills", "interest"];
        const countAnswers = (rows) => {
          const out = {};
          for (const r of rows) {
            if (ANSWER_FIELDS.some((f) => r[f])) {
              out[r.respondent_id] = (out[r.respondent_id] || 0) + 1;
            }
          }
          return out;
        };
        const answers = countAnswers(responses);

        // A team leader typically runs two assessments at once: the leaders
        // answer the gap analysis, the members answer the personal one. Those
        // are separate records with separate access codes, so without this the
        // leader would need two dashboard links and would see half the picture
        // on each.
        //
        // Related in both directions — the link is stored on the personal
        // record, but whichever of the pair the leader holds a token for
        // should show the other. The pairing is set by a facilitator in admin,
        // so surfacing a sibling is an intentional grant, not an escalation.
        //
        // Deliberately narrower than the primary roster: the sibling's
        // broadcast access_code is here so the leader can invite people, but
        // no per-respondent tokens. Those are resume links that open and edit
        // someone's answers, and a personal assessment is one individual's
        // account of their own skills — the leader needs to know it arrived,
        // not to be able to rewrite it.
        const related = assessments.filter((x) =>
          x.id !== a.id &&
          ((a.parent_assessment_id && x.id === a.parent_assessment_id) ||
            (x.parent_assessment_id && x.parent_assessment_id === a.id))
        );

        const linked = [];
        for (const rel of related) {
          const [relRespondents, relResponses] = await Promise.all([
            svc.Respondent.filter({ assessment_id: rel.id }),
            svc.Response.filter({ assessment_id: rel.id }),
          ]);
          const relAnswers = countAnswers(relResponses);
          linked.push({
            id: rel.id,
            title: rel.title,
            type: rel.assessment_type || "team_gap",
            status: rel.status,
            access_code: rel.access_code,
            respondents: relRespondents.map((r) => ({
              id: r.id,
              name: r.name,
              title: r.title || null,
              status: r.status,
              answer_count: relAnswers[r.id] || 0,
              completed_date: r.completed_date || null,
              created_date: r.created_date,
            })),
          });
        }

        return Response.json({
          assessment: shape(a, ["access_code"]),
          respondents: respondents.map((r) => ({
            id: r.id,
            name: r.name,
            title: r.title || null,
            token: r.token,
            status: r.status,
            answer_count: answers[r.id] || 0,
            completed_date: r.completed_date || null,
            created_date: r.created_date,
          })),
          linked,
        });
      }

      // Buyer report. No access_code, no team_token. Respondent statuses come
      // along so the report can score completed submissions only, and say how
      // many of its participants actually finished. No names — the report is
      // an aggregate view and never identifies individuals.
      case "buyer": {
        const a = assessments.find((x) => x.buyer_token && x.buyer_token === token);
        if (!a) return notFound();
        const respondents = await svc.Respondent.filter({ assessment_id: a.id });
        return Response.json({
          assessment: shape(a),
          respondents: respondents.map((r) => ({ id: r.id, status: r.status })),
        });
      }

      default:
        return Response.json({ error: "unknown mode" }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
