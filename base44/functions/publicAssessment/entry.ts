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

// Every field an answer can carry: the team gap's three, then the personal
// assessment's three. Shared by the respondent payload below and the team
// dashboard's answer counts — a personal assessment stores nothing in
// importance/execution, so a list covering only those reports every respondent
// on it as untouched.
const ANSWER_FIELDS = [
  "importance",
  "execution",
  "suggested_owner",
  "experience",
  "skills",
  "interest",
];

const shape = (assessment, extraFields = []) => {
  const out = {};
  for (const f of [...PUBLIC_FIELDS, ...extraFields]) out[f] = assessment[f] ?? null;
  return out;
};

// Who the printed report says prepared it. Resolved here because the pages
// that render it are unauthenticated and cannot read Organization for
// themselves, and because org_id alone is not enough: assessments predating
// organisations carry none, so the creator's own org is the second place to
// look. A name, never an id — attribution, not a handle onto anything.
//
// Returns null rather than throwing. A footer that cannot name the firm is a
// footer with one line fewer; a report that fails to load because a lookup
// missed is a broken deliverable.
const orgNameFor = async (svc, assessment) => {
  try {
    let orgId = assessment.org_id || null;
    if (!orgId && assessment.created_by_id) {
      const users = await svc.User.filter({ id: assessment.created_by_id });
      orgId = users?.[0]?.org_id || null;
    }
    if (!orgId) return null;
    const orgs = await svc.Organization.filter({ id: orgId });
    return orgs?.[0]?.name || null;
  } catch {
    return null;
  }
};

const shapeWithOrg = async (svc, assessment, extraFields = []) => ({
  ...shape(assessment, extraFields),
  org_name: await orgNameFor(svc, assessment),
});

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
        return Response.json({ assessment: await shapeWithOrg(svc, a) });
      }

      // Respondent returning via their personal ?t= link.
      case "respondent": {
        const respondents = await svc.Respondent.filter({ token });
        const r = respondents?.[0];
        if (!r) return notFound();
        const a = assessments.find((x) => x.id === r.assessment_id);
        if (!a) return notFound();
        // Their own answers, so a resumed survey comes back filled in and the
        // review screen can render what they submitted. The survey used to read
        // these with Response.list() from the browser, which required
        // Response.read to stay open to the world — and that returned every
        // answer every respondent in the app had ever given to anyone who
        // asked. Scoped to this token's respondent here, and no row ids: the
        // browser has no use for one now that saveResponses upserts by
        // activity.
        const own = await svc.Response.filter({ respondent_id: r.id }, null, 5000);
        return Response.json({
          assessment: await shapeWithOrg(svc, a),
          responses: own.map((row) => ({
            activity_id: row.activity_id,
            ...Object.fromEntries(ANSWER_FIELDS.map((f) => [f, row[f] ?? null])),
          })),
          respondent: {
            id: r.id,
            name: r.name,
            title: r.title || null,
            status: r.status,
            // Dates the printed copy of their answers, so it reads as a record
            // of what they submitted and when.
            completed_date: r.completed_date || null,
            // Their own closing feedback, so a resumed link or "Revise my
            // answers" brings back what they wrote rather than an empty box
            // they would have to fill in again.
            //
            // Only this mode returns them. The "team" and "buyer" shapes below
            // list their respondent fields explicitly and do not name these,
            // which is the whole of what keeps free text out of a report the
            // survey promised would be read in aggregate. Adding them there
            // would break that promise silently.
            closing_comments: r.closing_comments || null,
            missing_coverage: r.missing_coverage || null,
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
        // it cannot drift out of step with the responses themselves, and
        // counting whichever fields this assessment's type asks about — see
        // ANSWER_FIELDS above.
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

        // Per-respondent tokens are resume links: they reopen and edit that
        // person's answers. Handing them to a team leader is the whole point
        // of a gap-analysis dashboard, and exactly wrong for a personal one —
        // a personal assessment is one individual's account of their own
        // skills, and a leader needs to see that it arrived, not to be able to
        // rewrite it.
        //
        // The rule is the assessment's type, not which side of a pairing it
        // sits on. The sibling roster below withheld tokens from the start,
        // but a leader holding the personal assessment's *own* team token came
        // through this path and got the lot — the guard was keyed to the route
        // rather than to the data, which is how it looked correct and wasn't.
        const withholdTokens = (a.assessment_type || "team_gap") === "personal";

        return Response.json({
          assessment: await shapeWithOrg(svc, a, ["access_code"]),
          respondents: respondents.map((r) => ({
            id: r.id,
            name: r.name,
            title: r.title || null,
            ...(withholdTokens ? {} : { token: r.token }),
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
        const [respondents, responses] = await Promise.all([
          svc.Respondent.filter({ assessment_id: a.id }),
          svc.Response.filter({ assessment_id: a.id }, null, 5000),
        ]);
        return Response.json({
          assessment: await shapeWithOrg(svc, a),
          respondents: respondents.map((r) => ({ id: r.id, status: r.status })),
          // The answers this report is built from, scoped to this assessment.
          // The page read them with Response.filter from the browser, which is
          // one of the two reasons Response.read had to stay open — and an open
          // read on that entity hands over every answer in the app, not just
          // the ones behind the token being presented.
          //
          // respondent_id comes along because the report scores completed
          // submissions only and counts distinct participants; it is an id, not
          // a name, and this payload deliberately carries no names at all. Only
          // the team gap's three fields: a buyer token for a personal
          // assessment is refused by the page before it scores anything.
          responses: responses.map((row) => ({
            respondent_id: row.respondent_id,
            activity_id: row.activity_id,
            importance: row.importance ?? null,
            execution: row.execution ?? null,
            suggested_owner: row.suggested_owner ?? null,
          })),
        });
      }

      default:
        return Response.json({ error: "unknown mode" }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
