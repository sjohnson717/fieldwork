# Quartz Assessment

Two kinds of product-team assessment over one shared library of activities.

**Team gap analysis** — a team rates each activity on *importance* and *current
execution*, and suggests who should own it. The distance between importance and
execution is the finding, and it drives the consulting engagement.

**Personal assessment** — an individual rates their own *experience*, *skills*
and *interest* in the same activities. The output is a development profile
belonging to that person.

The two are separate records that can be linked, so a report can cross what a
team needs against what its people can actually do. Neither produces a single
overall score: the axes deliberately measure different things, and averaging
them destroys the findings the instrument exists to surface.

Built on [Base44](https://base44.com) — React, Vite and Tailwind against a
backend-as-a-service providing entities, auth and row-level security.

## Documentation

Most of what you need is inside the running app:

| Where | What |
|---|---|
| `/readme` | Architecture, entities, pages, and developer notes — things that have already bitten |
| `/facilitator-guide` | Running an engagement: setup, fielding, delivery, and what to tell participants |
| `base44/entities/README.md` | The data model and its security rules. **Read this before changing any entity** |

## Local development

```bash
npm install
npm run dev
```

`.env.local` needs the app ID and backend URL:

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

Local dev runs against the live backend, so entity records you create or edit
are real. `/admin` requires a facilitator account and redirects to Base44 for
sign-in, which may not resolve back to `localhost` — expect to verify admin
work in the published app. The token-authenticated pages need no such thing:
`/assess?code=…` and a `/report/…` or `/team/…` link work locally as they do in
production, which makes them the fastest way to check a change end to end.

| Script | |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Production build |
| `npm run lint` | ESLint (`lint:fix` to apply) |
| `npm run typecheck` | `tsc` over `jsconfig.json` |

## Publishing

Pushing to this repo reflects the code into the Base44 Builder; publishing from
[Base44](https://base44.com) deploys it.

**Publishing also re-applies every entity schema from `base44/entities/*.jsonc`.**
Those files are the source of truth. A field added through the platform API
works right up until the next publish and then vanishes — `create` succeeds and
returns a record with the column simply absent. If a field disappears with no
error, check the `.jsonc` first.

## Layout

```
base44/
  entities/     Entity schemas (.jsonc) — the source of truth, plus their README
  functions/    Backend functions: token resolution, invitations, admin listing
src/
  pages/        Routed pages, with admin/ for the facilitator's tabs
  components/   Shared UI, including the report documents and the
                facilitator's read-only preview of a respondent's
  lib/          Scoring, activity handling, auth context, token lookups
```

Scoring lives in two files that must not be merged: `scoring.js` (team gap,
0–3) and `personal-scoring.js` (personal, 0–5 with non-linear spacing). A `3`
does not mean the same thing in the two.

## Accounts and access

Facilitators have accounts. **Respondents, team leaders and buyers never do** —
an unguessable URL is the credential. Tokens are `crypto.randomUUID()`; the
access code on `/assess?code=…` is short and shoutable but only permits joining,
never reading anyone's data.

Row-level security fails closed and quietly, and a green build proves nothing
about it. Walk a real respondent through `/assess?code=…` after any change to an
entity's rules.

## Maintenance belongs in the app

Everything that accumulates is removable from `/admin` — organizations,
accounts, tags, library activities, activity sets, resources, job titles — and
each delete is guarded. Reaching for the Base44 Builder's data view instead is a
sign of a missing feature, not a workaround: the Builder has no reference checks,
and the references here are plain id strings that nothing enforces, so deleting a
row something still points at fails *silently*. Readers resolve ids against live
rows and drop what they cannot find, which means a bad delete removes a question
from every assessment using it and leaves nothing behind to say so.

The pattern for a new one: check authority and count references in a function,
refuse while anything references the row, name every blocker in one sentence, and
only show the control on rows that can actually go. Cascade only where the
children are meaningless without the parent, as `deleteAssessment` does. Counts
are taken as service role, because a count limited to what the caller can read
reports another consultant's data as unused.
