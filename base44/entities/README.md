# Entity RLS notes

The `.jsonc` files in this folder must stay **strict JSON with no comments**.
Despite the extension, Base44 stores and regenerates them as plain JSON, so any
comment risks the entity sync and would be stripped on the next round-trip
anyway. This file is where the reasoning lives instead.

## The `data.` prefix rule

Custom fields must be addressed with a `data.` prefix in RLS rules. Only
built-ins sit at the root: `id`, `created_by_id`, `created_date`, `updated_date`.

```jsonc
{ "data.collaborator_ids": "{{user.id}}" }   // correct
{ "collaborator_ids": "{{user.id}}" }        // silently never matches
```

A missing prefix does not raise an error — the clause just never matches, so the
rule fails closed and quietly removes access. Available template variables are
`{{user.id}}`, `{{user.email}}`, `{{user.role}}`, and `{{user.data.<field>}}`;
a custom field on the *user* (such as `org_id`) is `{{user.data.org_id}}`.

Verified supported: `$and`, `$or`, `$in`, `$nin`, and array containment
(matching a scalar against an array field).

## Why each non-obvious rule is the way it is

**Assessment.read mirrors `listRespondents`'s own check, clause for clause.**
The three unauthenticated flows — `/assess`, `/report/:token`, `/team/:token` —
used to find their assessment by listing every assessment and matching a token
client-side, which is why the rule stayed open long after it should have. They
now resolve tokens through `publicAssessment` as service role, so the rule was
narrowed to super-admin, creator, `collaborator_ids` membership, or an
`org_admin` whose `org_id` matches.

Note the org clause is deliberately `$and`-ed with `role: org_admin` rather
than standing alone. An org match on its own would also admit a plain `user` —
and revoking someone resets their role to `user` while leaving `org_id` in
place, so a revoked account would have kept reading its former organisation's
assessments.

`AdminPage` still filters the same way client-side. That is now redundant, and
worth keeping: with both layers a mistake in either one fails closed.

**Assessment.update is per-assessment, not per-role.** It grants the creator,
anyone in `collaborator_ids`, and super-admin. It previously granted any
`facilitator` or `org_admin` unconditionally, which let any facilitator edit
every assessment in the system including other organizations' client data.
Because org admins are not covered by role here, `AdminPage` seeds an
organization's admins into `collaborator_ids` when an assessment is created.

**User.update excludes `org_admin` deliberately.** It previously allowed any org
admin blanket write access to the User entity, which meant they could promote
themselves to `admin` or move users between organizations. Org admins manage
their own people through the `updateTeamMember` function, which enforces the org
boundary and the set of grantable roles server-side.

**Invitation.read needs `data.email`.** Without the prefix an invited user cannot
read their own invitation, and `reconcileOrgId` in `src/lib/AuthContext.jsx`
silently fails to stamp their `org_id` — leaving accounts stranded with no
organization even though their invitation named one.

**The built-in User entity ignores custom RLS on list operations.** Confirmed by
Base44 support. A direct `entities.User.list()` only ever returns the caller's
own record regardless of the read rule, which is why `listUsers` exists.

## Platform roles vs application roles

Base44's `users.inviteUser(email, role)` only accepts its own **platform** roles,
`user` and `admin`. Passing an application role is rejected:

```
Invalid role: "facilitator". Role must be either "user" or "admin".
```

So the two are kept separate. Everyone is invited at the platform level
(`admin` maps through, everything else becomes `user`), and the intended
application role travels on the `Invitation` record. The `acceptInvitation`
function applies it the first time that person signs in, matched to their own
authenticated email, and marks the invitation `accepted` so it is consumed
exactly once — otherwise a stale pending invitation would re-promote someone
after an admin demoted them.

Role assignment is deliberately server-side — see the next section for why
self-update is no longer permitted at all.

## The built-in User entity ignores entity-level RLS

This one is measured, not assumed, and it is the opposite of what the rules
imply. On `User` specifically:

| Protection | Enforced? |
|---|---|
| Entity-level `rls.update` | **No** |
| Entity-level `rls.read` on list operations | **No** (confirmed by Base44 support) |
| Per-field `properties.<field>.rls` | **Yes** |
| Base44's own rule on the `role` field | **Yes**, always |

Setting `rls.update` to super-admin only did *not* stop a non-admin from
rewriting their own record — the rule went live and the write still landed.
Only the per-field rule on `org_id` actually blocked it:

```
You're not allowed to modify the following fields: data.org_id
```

`role` needs no rule of ours; Base44 rejects any non-admin attempt to change it
with *"Only platform users can update user roles"*.

**So `org_id`'s protection is the per-field rule inside `properties`, not the
entity-level one.** Do not remove it. Every org boundary in the app rests on it:
`listUsers` and `updateTeamMember` both derive authority from the caller's
stored `org_id`, so a user who could rewrite that field could read and manage
another tenant's data — and `updateTeamMember` writes as service role, which
bypasses even Base44's own role protection.

The entity-level `update` rule is kept as defence in depth, but it is not what
is doing the work. Treat any *new* custom field on `User` as unprotected until
it has a per-field rule, and verify with a probe rather than assuming.

## Public token flows

`/assess`, `/team/:token` and `/report/:token` are unauthenticated by design —
the token in the URL *is* the credential, so buyers and team leaders never need
an account. That only holds if the tokens cannot be enumerated, and originally
they could: every one of those pages listed all assessments client-side, so
anyone could read `access_code`, `team_token` and `buyer_token` off the records.

All three now go through `publicAssessment`, which resolves the token with the
service role and returns only the fields that flow renders. Redaction is part of
the point: a team leader never receives the buyer's report token, a buyer never
receives the access code, and a respondent receives no tokens at all. Failures
return a uniform `not_found` so a caller cannot probe which tokens exist.

Respondents are **self-registering**: the team leader broadcasts one
`/assess?code=…` link, and a Respondent row is created when each person enters
their name and job title. Nobody is pre-added, so there is no "invited" state —
a row exists only once someone has actually signed in. "In progress" is derived
from whether they have answered anything, not stored, so it cannot drift out of
step with the responses.

Token strength matters here. `buyer_token`, `team_token` and the per-respondent
token are `crypto.randomUUID()`. `access_code` is deliberately short so it can
be read aloud to a room — treat it as a convenience credential, not a secret.

## Why deleting an assessment goes through a function

The child entities — `Response`, `Respondent`, `DiscussionNote`,
`TeamLeaderFlag` — all permit deletion by role, including `facilitator`.
`Assessment.delete` permits only its creator or a super-admin. Those rules are
individually defensible and collectively wrong: the cascade used to run in the
browser, children first, so a facilitator was *permitted* to destroy every
respondent and response in an engagement and then denied the final step,
leaving an empty assessment and an error alert.

`deleteAssessment` checks authority once — creator or super-admin, matching
`Assessment.delete` — and then cascades as service role. `AdminPage` also hides
the button from anyone who would fail that check, so the UI and the rule agree.

The general lesson: when one user action spans several entities, the permission
that matters is the *whole action's*, and RLS can only answer one entity at a
time. Put the check in a function before the first write.

## Why Respondent reads go through a function

`Respondent` holds team members' names and job titles. Together with
`Assessment.company_name` that is the data one consultant must not see from
another's engagement, so both need scoping.

`Assessment` can be scoped with RLS directly — super-admin, or `org_id` match,
or membership of `collaborator_ids`, all of which RLS can express.

`Respondent` cannot. The real rule is "may this user see the *parent
assessment*?", and RLS cannot join. Denormalising `org_id` onto Respondent
would answer the wrong question: a facilitator invited to a single assessment
in another consultant's organisation is exactly the case the role model exists
to support, and an org-scoped rule would deny them. Denormalising
`collaborator_ids` as well would go stale whenever collaborators change.

So `listRespondents` performs the parent-assessment check server-side, mirroring
Assessment's own rules, and reads as service role. The public flows get theirs
from `publicAssessment` the same way. Nothing reads `Respondent` directly from
the client any more, which is what allowed its read rule to be narrowed to
super-admin only.

`create` and `update` stay open, because `/assess` is unauthenticated and each
respondent registers themselves. The open question was whether Base44 applies
the read rule to the record a `create` or `update` returns — `AssessPage` uses
that returned record, so if it did, self-registration would break for everyone
who is not a super-admin.

**Measured on 2026-07-30: it does not.** With `read` closed to super-admin only,
an anonymous respondent still registered and answered normally. So a write rule
is what governs a write's return value, not the read rule. Still worth walking
one respondent through `/assess?code=…` after any change here, because a green
build proves nothing about RLS.

## Two assessment types on one entity

`Assessment.assessment_type` is `team_gap` or `personal`, and `Response` carries
both sets of answer fields. Absent means `team_gap`, which is what every record
predating the field is — nothing was backfilled, and nothing needs to be.

**It is not called `type`, and must not be.** It was, briefly, and the field
silently vanished: `Assessment.create` accepted a payload containing
`type: "personal"`, returned success, and stored a record with no `type` at
all. No error, no validation failure, nothing in the response to indicate the
field had been discarded. The name collides with the schema's own `type`
keyword — every entity schema is `{"name": …, "type": "object", "properties":
…}` — and Base44's validation layer drops the custom field rather than
reporting the ambiguity.

Two details worth keeping, because they made this hard to see. The bug is on
the **SDK write path only**: a direct database `$set` of `type` persisted
perfectly well, so the field looked writable when probed from the outside. And
the symptom appeared far from the cause — a personal assessment rendered as a
gap analysis, which reads like a UI bug in the type branch rather than a
missing column. The general lesson: if a field never arrives and nothing
errors, suspect the name before the logic.

A second entity was the obvious alternative and would have been worse. The two
types share the activity library, respondent self-registration, the access code,
the token flows and the whole `/assess` journey; only the questions differ. A
parallel `PersonalResponse` would have meant a second set of RLS rules to keep
in step with this one, a second branch in `publicAssessment`, and a second
cascade in `deleteAssessment` that would fail closed the day someone forgot it.

The cost of one entity is that a Response has fields it never uses. `AssessPage`
writes only the fields its type asks about, so a type change on an assessment
that already has responses cannot silently blank the other half — though nothing
offers to change type, and the create form deliberately doesn't let you.

**`parent_assessment_id` is optional in both directions.** It links a personal
assessment to a team gap assessment so the Results tab can cross capability
against importance. RLS cannot enforce a join here any more than it can for
Respondent, and it doesn't need to: a facilitator invited to the personal
assessment but not the team one simply cannot read the parent, and
`PersonalResults` catches that and drops the cross-analysis rather than the
page. Failing to a narrower report is the right failure.

The pairing also drives the team leader dashboard, because the common setup is
that the leaders answer the gap analysis while their team answers the personal
one. `publicAssessment`'s `team` mode follows the link in both directions and
returns the sibling's roster alongside its own, so one dashboard link covers
both. What it returns for the sibling is deliberately thinner than for the
primary: title, status, access code and roster statuses, but **no
per-respondent tokens**. A respondent token is a resume link that reopens and
edits that person's answers, and a personal assessment is one individual's
account of their own skills — a leader needs to see that it arrived, not to be
able to rewrite it. The primary roster still carries tokens, unchanged, because
handing out those links is what that page is for.

## The no-org bucket

Absent/null `org_id` is treated as its own shared bucket by `sameOrg()` in
`src/lib/roles.js`, so records predating Organizations keep working. Note this
means *all* null-org users share a tenant — assign real orgs before relying on
org scoping for isolation.
